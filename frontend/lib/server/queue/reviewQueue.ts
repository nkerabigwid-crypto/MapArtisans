// PAS de `import "server-only"` ici, volontairement : ce module est aussi
// importé par workers/reviewWorker.ts, qui tourne comme un processus Node
// autonome, hors du bundler de Next. Le paquet `server-only` lève de façon
// INCONDITIONNELLE dès qu'il est chargé ailleurs que sous le bundler de Next
// (c'est ce dernier, et lui seul, qui sait le neutraliser) — l'ajouter ici
// ferait planter le worker au démarrage. La frontière réelle est déjà tenue
// autrement : rien sous lib/server/ n'est importé par un composant "use
// client" (vérifié), et chaque route Next qui l'utilise déclare elle-même
// `export const runtime = "nodejs"`.
import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import type { Repo } from "@/lib/server/repo";
import { accesAutorise } from "@/lib/server/essai";

export const REVIEW_REPLY_QUEUE = "review-replies";

export interface ReviewReplyJobData {
  reviewId: string;
}

let queue: Queue<ReviewReplyJobData> | null = null;

export function getReviewReplyQueue(): Queue<ReviewReplyJobData> {
  if (queue) return queue;
  queue = new Queue<ReviewReplyJobData>(REVIEW_REPLY_QUEUE, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      // Une seule tentative BullMQ : le rejeu sur erreur transitoire (429, 503)
      // se fait DÉJÀ à l'intérieur du worker, via withBackoff — voir
      // resilience.ts. Superposer les deux mécanismes ferait rejouer une
      // erreur définitive (400, avis introuvable) plusieurs fois pour rien,
      // et rejouerait une erreur transitoire deux fois plus lentement que
      // prévu (le délai de withBackoff, puis celui de BullMQ par-dessus).
      attempts: 1,
      removeOnComplete: { age: 86_400, count: 1_000 },
      // Les échecs sont conservés une semaine, pour investigation — un job
      // supprimé au premier échec ne laisse aucune trace de ce qui a coincé.
      removeOnFail: { age: 604_800 },
    },
  });
  return queue;
}

/**
 * Met en file un job de réponse pour chaque avis en attente des fiches ayant
 * activé la réponse automatique.
 *
 * Le déclenchement périodique est délibérément hors de cette fonction : elle
 * décrit UNE exécution, pas la programmation. Voir workers/planificateur.ts.
 *
 * Ce commentaire renvoyait à `workers/reviewScheduler.ts`, un fichier qui n'a
 * jamais été écrit — et c'est exactement pour cela qu'aucun avis n'était traité
 * en production : la fonction n'était appelée que par les tests.
 */
export async function enqueuePendingReviews(repo: Repo): Promise<number> {
  const q = getReviewReplyQueue();
  const profiles = await repo.listProfilesWithAutoReplyEnabled();

  let enqueued = 0;
  for (const profile of profiles) {
    /*
     * Un essai expiré ne doit plus rien consommer. Chaque avis traité coûte un
     * appel OpenAI facturé, et ce compte n'a jamais payé : sans ce contrôle, un
     * inscrit d'un jour continuerait de générer des réponses indéfiniment.
     */
    const entreprise = await repo.getCompanyForProfile(profile.id);
    if (entreprise) {
      const verdict = accesAutorise({
        subscriptionStatus: entreprise.subscriptionStatus,
        trialEndsAt: entreprise.trialEndsAt,
        gracePeriodEndsAt: entreprise.gracePeriodEndsAt,
      });
      if (!verdict.ok) continue;
    }

    const pending = await repo.listPendingReviews(profile.id);
    for (const review of pending) {
      // jobId = reviewId : une mise en file répétée du même avis (le
      // planificateur tourne toutes les heures, un avis peut rester en file
      // plus longtemps qu'un cycle) ne crée pas de doublon — BullMQ ignore un
      // jobId déjà présent tant qu'il n'a pas terminé.
      await q.add("reply", { reviewId: review.id }, { jobId: review.id });
      enqueued++;
    }
  }
  return enqueued;
}
