// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "./connection";
import { VIDEO_POST_QUEUE, type VideoPostJobData } from "./videoQueue";
import { getRepo, type Repo } from "@/lib/server/repo";
import { SUJETS, type SujetPost } from "@/lib/server/ai/posts";
import { genererPostVideo, type DependancesVideo } from "@/lib/server/video/generer";
import { estEchecDeConfiguration } from "@/lib/server/video/fal";

export interface VideoWorkerDeps extends DependancesVideo {
  repo?: Repo;
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
  } catch (erreur) {
    const motif = erreur instanceof Error ? erreur.message : String(erreur);

    if (estEchecDeConfiguration(erreur)) {
      await repo.libererPostVideo(data.videoPostId);
      console.error(
        `[video] ${data.businessName} — période RENDUE (configuration) : ${motif}`,
      );
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
