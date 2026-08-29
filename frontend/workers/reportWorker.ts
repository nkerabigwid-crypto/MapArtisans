/**
 * Point d'entrée du worker de rapport SMS hebdomadaire.
 *
 * Processus Node séparé, pour les mêmes raisons que workers/reviewWorker.ts :
 * un Worker BullMQ doit vivre en continu, ce qu'aucun modèle de serveur Next
 * n'offre.
 *
 * Démarrage : npm run worker:reports
 */
import { createReportWorker } from "@/lib/server/queue/reportWorker";

const worker = createReportWorker();

worker.on("completed", (job) => {
  console.log(`[report-worker] rapport envoyé pour la fiche ${job.data.profileId}`);
});

worker.on("failed", (job, err) => {
  console.error(`[report-worker] fiche ${job?.data.profileId} en échec : ${err.message}`);
});

console.log("[report-worker] démarré, en écoute sur la file « weekly-reports »");

async function shutdown(signal: string) {
  console.log(`[report-worker] signal ${signal} reçu, arrêt en cours…`);
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
