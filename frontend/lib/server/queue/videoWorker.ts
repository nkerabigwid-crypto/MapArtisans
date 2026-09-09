// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "./connection";
import { VIDEO_POST_QUEUE, type VideoPostJobData } from "./videoQueue";
import { getRepo, type Repo } from "@/lib/server/repo";
import { SUJETS, type SujetPost } from "@/lib/server/ai/posts";
import { genererPostVideo, type DependancesVideo } from "@/lib/server/video/generer";

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
 * repaierait. Le `catch` marque `failed` AVANT de relever : c'est ce qui
 * garantit qu'un échec coûte une fois, pas indéfiniment.
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
    await repo.marquerVideoEchouee(data.videoPostId, motif);
    console.error(`[video] ${data.businessName} en échec :`, motif);
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
