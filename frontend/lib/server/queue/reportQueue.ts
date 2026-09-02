// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import type { Repo } from "@/lib/server/repo";
import { accesAutorise } from "@/lib/server/essai";

export const WEEKLY_REPORT_QUEUE = "weekly-reports";

export interface WeeklyReportJobData {
  profileId: string;
}

let queue: Queue<WeeklyReportJobData> | null = null;

export function getWeeklyReportQueue(): Queue<WeeklyReportJobData> {
  if (queue) return queue;
  queue = new Queue<WeeklyReportJobData>(WEEKLY_REPORT_QUEUE, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      // Une seule tentative BullMQ, comme pour les avis : le rejeu sur erreur
      // transitoire se fait déjà dans withBackoff. Voir reviewQueue.ts.
      attempts: 1,
      removeOnComplete: { age: 604_800, count: 5_000 },
      removeOnFail: { age: 2_592_000 },
    },
  });
  return queue;
}

/**
 * Met en file le rapport hebdomadaire de chaque fiche éligible.
 *
 * Le `jobId` inclut la semaine ISO : un même artisan ne peut pas recevoir deux
 * rapports la même semaine, même si le planificateur est relancé après un
 * incident. Sans cette clé, une reprise après panne enverrait un doublon — et
 * un SMS envoyé deux fois ne se rattrape pas.
 */
export async function enqueueWeeklyReports(repo: Repo, when = new Date()): Promise<number> {
  const q = getWeeklyReportQueue();
  const semaine = isoWeekKey(when);

  const stats = await repo.listWeeklyStats();
  for (const s of stats) {
    /*
     * Même règle que pour les avis : un SMS coûte cinq à dix centimes, et un
     * essai expiré n'a jamais rien payé. Le contrôle est ici, à la mise en
     * file, plutôt que dans le worker : un job créé puis abandonné aurait déjà
     * traversé Redis pour rien.
     */
    const entreprise = await repo.getCompanyForProfile(s.googleProfileId);
    if (entreprise) {
      const verdict = accesAutorise({
        subscriptionStatus: entreprise.subscriptionStatus,
        trialEndsAt: entreprise.trialEndsAt,
        gracePeriodEndsAt: entreprise.gracePeriodEndsAt,
      });
      // `travailler` et non `ok` : un inscrit peut entrer dans le produit
      // avant d'avoir rattache sa fiche, sans que rien ne soit depense pour
      // lui. Voir essai.ts — les deux notions sont distinctes.
      if (!verdict.travailler) continue;
    }

    await q.add(
      "report",
      { profileId: s.googleProfileId },
      // Séparateur `__` et non `:` : BullMQ réserve les deux-points à ses
      // propres clés Redis et rejette tout jobId qui en contient.
      { jobId: `${s.googleProfileId}__${semaine}` },
    );
  }
  return stats.length;
}

/**
 * Clé de semaine ISO 8601, au format `2026-W35`.
 *
 * Le calcul suit la norme : la semaine 1 est celle qui contient le premier
 * jeudi de l'année. Un simple `Math.floor(jour / 7)` produirait des décalages
 * en fin d'année, et donc des doublons ou des rapports manquants.
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Jour de la semaine avec dimanche = 7, comme le veut la norme ISO.
  const jour = d.getUTCDay() || 7;
  // On se place sur le jeudi de la semaine courante : c'est lui qui détermine
  // l'année ISO, laquelle peut différer de l'année civile fin décembre.
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semaine).padStart(2, "0")}`;
}
