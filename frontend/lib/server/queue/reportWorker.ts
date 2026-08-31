// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "./connection";
import { WEEKLY_REPORT_QUEUE, type WeeklyReportJobData } from "./reportQueue";
import { getRepo, type Repo } from "@/lib/server/repo";
import { composeWeeklyReport } from "@/lib/server/sms/weeklyReport";
import { assertAffordable, resolveSmsSender, type SmsSender } from "@/lib/server/sms/twilio";

export interface ReportWorkerDeps {
  repo?: Repo;
  sender?: SmsSender;
}

/**
 * Compose et envoie le rapport hebdomadaire d'une fiche.
 *
 * Exportée séparément du Worker BullMQ pour être testable sans file ni Redis
 * quand seul le comportement métier est en cause — même découpage que pour le
 * worker d'avis.
 */
export async function processWeeklyReportJob(
  data: WeeklyReportJobData,
  deps: ReportWorkerDeps = {},
): Promise<void> {
  const repo = deps.repo ?? getRepo();
  const sender = deps.sender ?? resolveSmsSender();

  const toutes = await repo.listWeeklyStats();
  const stats = toutes.find((s) => s.googleProfileId === data.profileId);
  // Une fiche peut avoir perdu son numéro entre la mise en file et le
  // traitement : on sort sans erreur plutôt que d'échouer bruyamment sur un
  // cas qui n'a rien d'anormal.
  if (!stats) return;

  const body = composeWeeklyReport({
    businessName: stats.businessName,
    bestPosition: stats.bestPosition,
    previousPosition: stats.previousPosition,
    callsGenerated: stats.callsGenerated,
    directionsGenerated: stats.directionsGenerated,
    pendingReviews: stats.pendingReviews,
    brandName: stats.brandName,
  });

  // Garde-fou de coût AVANT l'envoi : un rapport devenu trop long doit faire
  // échouer le job de façon visible, pas partir en trois segments facturés.
  assertAffordable(body, 1);

  await sender.send(stats.phoneNumber, body);

  /*
   * Le rapport est COMPTÉ mais jamais bloqué — voir sms/quota.ts. Il coûte
   * quatre à cinq SMS par mois, c'est prévisible, et c'est la promesse vendue
   * à l'artisan : le couper pour économiser trente centimes reviendrait à ne
   * pas livrer ce qu'il a payé, précisément le mois où il utilise le plus le
   * produit. Il doit en revanche peser sur le compteur, sans quoi le plafond
   * ne refléterait pas la dépense réelle.
   *
   * Le comptage n'échoue pas le job : le SMS est parti et facturé, faire
   * échouer ici le ferait renvoyer au rejeu.
   */
  const entreprise = await repo.getCompanyForProfile(data.profileId);
  if (entreprise) {
    try {
      await repo.incrementerSmsDuMois(entreprise.id);
    } catch (err) {
      console.error(`[report-worker] comptage SMS échoué pour ${entreprise.id} :`, err);
    }
  }
}

/** Démarre le worker BullMQ. Processus long, séparé du serveur web. */
export function createReportWorker(deps: ReportWorkerDeps = {}): Worker<WeeklyReportJobData> {
  return new Worker<WeeklyReportJobData>(
    WEEKLY_REPORT_QUEUE,
    async (job: Job<WeeklyReportJobData>) => processWeeklyReportJob(job.data, deps),
    {
      connection: getRedisConnection(),
      // Plus élevé que pour les avis : un SMS est une requête courte, et
      // Twilio encaisse un débit bien supérieur à l'API Google Business
      // Profile. La tournée hebdomadaire doit s'écouler vite.
      concurrency: 10,
      // Plafond de débit, en complément : Twilio applique ses propres quotas
      // et une rafale trop dense déclencherait des 429 en cascade.
      limiter: { max: 20, duration: 1000 },
    },
  );
}
