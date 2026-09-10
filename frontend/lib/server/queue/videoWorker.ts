// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "./connection";
import { VIDEO_POST_QUEUE, type VideoPostJobData } from "./videoQueue";
import { getRepo, type Repo } from "@/lib/server/repo";
import { SUJETS, type SujetPost } from "@/lib/server/ai/posts";
import { genererPostVideo, type DependancesVideo } from "@/lib/server/video/generer";
import { estEchecDeConfiguration } from "@/lib/server/video/fal";
import {
  alerterSolde,
  seuilFranchi,
  FENETRE_ANTI_REPETITION_S,
  type DependancesAlerte,
} from "@/lib/server/video/alerte";

export interface VideoWorkerDeps extends DependancesVideo, DependancesAlerte {
  repo?: Repo;
  /** Enveloppe mensuelle declaree, en dollars. 0 = aucune alerte preventive. */
  enveloppeUsd?: number;
  /** Injectable pour que le test n'ait pas à composer avec le hasard. */
  choisirSujet?: (profileId: string) => SujetPost;
}

/**
 * Choisit le sujet de la vidéo.
 *
 * Tourne sur la liste au fil des périodes plutôt que de tirer au sort : douze
 * vidéos annuelles dont quatre parleraient d'urgence et aucune de saison se
 * remarqueraient. Le décalage par profil évite que tous les artisans publient
 * le même thème la même semaine.
 */
export function sujetParDefaut(profileId: string, quand = new Date()): SujetPost {
  const mois = quand.getFullYear() * 12 + quand.getMonth();
  const decalage = profileId.length;
  return SUJETS[(mois + decalage) % SUJETS.length].tag;
}

/**
 * Produit la vidéo d'une ligne déjà réservée.
 *
 * L'ÉCHEC EST ENREGISTRÉ, PAS SEULEMENT LEVÉ
 *
 * Une exception qui remonte à BullMQ laisse la ligne en `pending`, et le
 * passage suivant la croirait libre — donc la régénérerait, donc la
 * repaierait. Le `catch` tranche AVANT de relever.
 *
 * DEUX ÉCHECS, DEUX TRAITEMENTS OPPOSÉS
 *
 * · CONFIGURATION — solde vide, clé révoquée, quota. Survenu avant tout appel
 *   facturable, donc rien n'a été produit ni payé. La période est LIBÉRÉE :
 *   la marquer `failed` la consommerait, et le client n'aurait jamais sa vidéo
 *   du mois, même une fois le compte rechargé.
 *
 * · TOUT LE RESTE — y compris une panne réseau en pleine génération. Marqué
 *   `failed`. Une vidéo peut avoir été facturée sans que la réponse nous
 *   parvienne ; la reprendre paierait deux fois. Entre perdre une période et
 *   payer deux fois, on perd la période.
 *
 * Exportée séparément du Worker BullMQ pour être testable sans Redis, comme
 * les autres workers.
 */
export async function processVideoPostJob(
  data: VideoPostJobData,
  deps: VideoWorkerDeps = {},
): Promise<void> {
  const repo = deps.repo ?? getRepo();
  const sujet = (deps.choisirSujet ?? sujetParDefaut)(data.profileId);

  try {
    const post = await genererPostVideo(
      {
        profilId: data.profileId,
        businessName: data.businessName,
        city: data.city,
        tradeType: data.tradeType,
        sujet,
      },
      deps,
    );

    await repo.marquerVideoGeneree(data.videoPostId, {
      personnage: post.personnage,
      script: post.script,
      videoUrl: post.videoUrl,
      coutUsd: post.coutUsd,
    });

    console.log(
      `[video] ${data.businessName} — ${post.personnage}, ${post.coutUsd.toFixed(3)} $`,
    );

    /*
     * L'alerte PRÉVENTIVE, après la réussite et non avant.
     *
     * Avant, elle porterait sur une dépense qui n'a pas encore eu lieu. Après,
     * elle mesure ce qui est réellement engagé — et elle ne peut plus faire
     * échouer la vidéo, puisque celle-ci est déjà produite.
     */
    const enveloppe = deps.enveloppeUsd ?? Number(process.env.FAL_BUDGET_USD ?? 0);
    if (enveloppe > 0) {
      const depenseUsd = await repo.coutVideoDuMois();
      if (seuilFranchi({ depenseUsd, enveloppeUsd: enveloppe })) {
        await alerterSolde("seuil", { depenseUsd, enveloppeUsd: enveloppe }, alerteDeps(deps));
      }
    }
  } catch (erreur) {
    const motif = erreur instanceof Error ? erreur.message : String(erreur);

    if (estEchecDeConfiguration(erreur)) {
      await repo.libererPostVideo(data.videoPostId);
      console.error(
        `[video] ${data.businessName} — période RENDUE (configuration) : ${motif}`,
      );
      /*
       * L'alerte RÉACTIVE. Elle ne prévient plus, elle constate — mais elle ne
       * dépend d'aucun réglage, et c'est justement ce qui la rend fiable : une
       * alerte qui repose sur une enveloppe correctement renseignée ne protège
       * pas de l'oubli humain.
       */
      await alerterSolde("epuise", { depenseUsd: 0, enveloppeUsd: 0 }, alerteDeps(deps));
    } else {
      await repo.marquerVideoEchouee(data.videoPostId, motif);
      console.error(`[video] ${data.businessName} en échec :`, motif);
    }
    throw erreur;
  }
}

export function startVideoPostWorker(deps: VideoWorkerDeps = {}): Worker<VideoPostJobData> {
  return new Worker<VideoPostJobData>(
    VIDEO_POST_QUEUE,
    async (job: Job<VideoPostJobData>) => processVideoPostJob(job.data, deps),
    {
      connection: getRedisConnection(),
      // Une seule vidéo à la fois. Elles prennent une minute chacune et
      // coûtent de l'argent : rien ne justifie d'en lancer plusieurs de front,
      // et la sérialisation rend les journaux lisibles quand ça dérape.
      concurrency: 1,
    },
  );
}

/**
 * Anti-répétition adossé à Redis.
 *
 * Sans lui, un solde vide enverrait un SMS par vidéo refusée : plusieurs par
 * heure, à cinq centimes pièce, le jour précis où l'on ne veut plus dépenser.
 *
 * Redis est déjà là pour la file ; s'il est indisponible, on laisse passer
 * l'alerte plutôt que de l'avaler. Un SMS en trop vaut mieux qu'un silence.
 */
function alerteDeps(deps: VideoWorkerDeps): DependancesAlerte {
  if (deps.dejaEnvoyee || deps.marquerEnvoyee) return deps;

  const cle = (motif: string) =>
    `video:alerte:${motif}:${new Date().toISOString().slice(0, 10)}`;

  return {
    sender: deps.sender,
    destinataire: deps.destinataire,
    async dejaEnvoyee(motif) {
      try {
        return (await getRedisConnection().get(cle(motif))) !== null;
      } catch {
        return false;
      }
    },
    async marquerEnvoyee(motif) {
      try {
        await getRedisConnection().set(cle(motif), "1", "EX", FENETRE_ANTI_REPETITION_S);
      } catch {
        /* Une alerte non mémorisée sera renvoyée demain : sans gravité. */
      }
    },
  };
}
