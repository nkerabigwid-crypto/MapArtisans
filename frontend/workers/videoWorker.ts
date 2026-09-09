/**
 * Point d'entrée du worker de posts vidéo.
 *
 * Processus Node séparé, pour la même raison que les deux autres workers : un
 * Worker BullMQ doit vivre en continu, ce qu'aucun modèle de serveur Next
 * n'offre.
 *
 * IL NE PUBLIE RIEN. Il produit la vidéo et laisse la ligne en `generated`.
 * La publication sur la fiche Google attend l'accès à l'API Business Profile —
 * voir lib/server/video/generer.ts.
 *
 * Démarrage : npm run worker:video
 */
import { startVideoPostWorker } from "@/lib/server/queue/videoWorker";

const worker = startVideoPostWorker();

worker.on("completed", (job) => {
  console.log(`[video-worker] vidéo produite pour ${job.data.businessName}`);
});

worker.on("failed", (job, err) => {
  // La ligne a déjà été marquée `failed` en base par processVideoPostJob : ce
  // journal sert à l'exploitant, pas à la reprise.
  console.error(`[video-worker] ${job?.data.businessName} en échec : ${err.message}`);
});

console.log("[video-worker] démarré, en écoute sur la file « video-posts »");

async function shutdown(signal: string) {
  console.log(`[video-worker] signal ${signal} reçu, arrêt en cours…`);
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
