// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import type { Repo } from "@/lib/server/repo";
import { accesAutorise } from "@/lib/server/essai";
import { clePeriode } from "@/lib/server/video/cadence";

export const VIDEO_POST_QUEUE = "video-posts";

export interface VideoPostJobData {
  /** Ligne déjà réservée en base : le job n'a plus qu'à la remplir. */
  videoPostId: string;
  profileId: string;
  businessName: string;
  city: string;
  tradeType: string;
}

let queue: Queue<VideoPostJobData> | null = null;

export function getVideoPostQueue(): Queue<VideoPostJobData> {
  if (queue) return queue;
  queue = new Queue<VideoPostJobData>(VIDEO_POST_QUEUE, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      // Une seule tentative, comme les autres files : le rejeu sur erreur
      // transitoire est déjà fait par withBackoff, à l'intérieur du job.
      //
      // Ici la raison est plus forte qu'ailleurs. Un job rejoué après une
      // coupure survenue APRÈS l'appel à fal.ai regénérerait une vidéo déjà
      // facturée. La ligne réservée en base est la seule mémoire fiable.
      attempts: 1,
      removeOnComplete: { age: 2_592_000, count: 5_000 },
      removeOnFail: { age: 2_592_000 },
    },
  });
  return queue;
}

/**
 * Met en file les vidéos dues, une par fiche éligible et par période.
 *
 * DEUX FILTRES, DANS CET ORDRE, ET L'ORDRE COMPTE
 *
 * 1. Le palier donne-t-il droit à une vidéo, et laquelle pour cette période ?
 *    `clePeriode` renvoie `null` pour un palier sans vidéo — on s'arrête là
 *    sans rien interroger de plus.
 *
 * 2. L'accès est-il ouvert ? Même règle que pour les SMS et les rapports :
 *    `travailler` et non `ok`, parce qu'un inscrit peut exister avant d'avoir
 *    rattaché sa fiche, sans qu'on dépense rien pour lui.
 *
 * 3. La période est-elle libre ? C'est `reserverPostVideo` qui tranche, et
 *    c'est l'INSERT lui-même qui verrouille — voir la migration 030.
 *
 * Le contrôle est ici, à la mise en file, et non dans le worker : un job créé
 * puis abandonné aurait déjà traversé Redis pour rien. Et surtout, la réserve
 * en base précède l'entrée en file — si Redis perd le job, la ligne reste en
 * `pending` et se voit ; si l'ordre était inverse, on aurait payé sans trace.
 */
export async function enqueueDueVideoPosts(repo: Repo, when = new Date()): Promise<number> {
  /*
   * RIEN N'EST RESERVE SI LA FONCTION N'EST PAS CONFIGUREE.
   *
   * Sans FAL_KEY, chaque generation echouerait — et une periode marquee
   * `failed` est CONSOMMEE : la contrainte d'unicite l'empeche d'etre reprise.
   * Le client ne recevrait alors jamais sa video, meme une fois la cle
   * ajoutee, parce que la ligne de septembre existerait deja.
   *
   * Ne rien reserver est donc le seul comportement rattrapable. Le controle
   * est ici plutot que dans le worker : c'est la reservation qui brule la
   * periode, pas la generation.
   */
  if (!process.env.FAL_KEY?.trim()) return 0;

  const q = getVideoPostQueue();
  let mises = 0;

  for (const fiche of await repo.listerFichesPourVideo()) {
    const periode = clePeriode(fiche.planId, when);
    if (!periode) continue;

    const verdict = accesAutorise({
      subscriptionStatus: fiche.subscriptionStatus as never,
      trialEndsAt: fiche.trialEndsAt,
      gracePeriodEndsAt: fiche.gracePeriodEndsAt,
    });
    if (!verdict.travailler) continue;

    const videoPostId = await repo.reserverPostVideo(fiche.googleProfileId, periode);
    // `null` : la période est déjà servie. Cas NORMAL à chaque passage du
    // planificateur après le premier — pas une anomalie à journaliser.
    if (!videoPostId) continue;

    await q.add(
      "generer",
      {
        videoPostId,
        profileId: fiche.googleProfileId,
        businessName: fiche.businessName,
        city: fiche.city,
        tradeType: fiche.tradeType,
      },
      // Le jobId reprend la ligne réservée : même si Redis est repeuplé après
      // un incident, le même travail ne peut pas entrer deux fois.
      { jobId: `video:${videoPostId}` },
    );
    mises++;
  }

  return mises;
}
