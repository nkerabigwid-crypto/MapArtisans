/**
 * Point d'entrée du worker de réponse aux avis.
 *
 * Décision d'architecture : ce fichier tourne comme un **processus Node
 * séparé**, jamais dans le serveur Next. C'est un choix technique, pas une
 * envie de simplicité :
 *
 * · Un Worker BullMQ doit vivre en continu pour tenir sa connexion Redis
 *   ouverte et recevoir les jobs au fil de l'eau. Le serveur de dev Next
 *   recharge son processus à chaud, et le monde serverless (Vercel et
 *   assimilés) tue une fonction dès sa réponse envoyée — aucun des deux modèles
 *   n'offre le processus long-vivant dont un worker a besoin.
 *
 * Ce que ce choix N'est PAS : un retour au service Fastify/Express séparé
 * proposé initialement. Le worker reste dans le même dépôt, le même
 * `package.json`, le même `tsconfig.json`, et importe le même code
 * (`lib/server/`) que les routes API — aucun type dupliqué, aucun contrat
 * HTTP à maintenir entre deux services pour se parler. Seul le point d'entrée
 * du *processus* diffère de celui du serveur web.
 *
 * Démarrage : npm run worker:reviews
 * (charge .env.local via --env-file, natif depuis Node 20.6 — aucune
 * dépendance dotenv nécessaire)
 */
import { createReviewWorker } from "@/lib/server/queue/reviewWorker";

const worker = createReviewWorker();

worker.on("completed", (job) => {
  console.log(`[review-worker] avis ${job.data.reviewId} traité avec succès`);
});

worker.on("failed", (job, err) => {
  console.error(`[review-worker] avis ${job?.data.reviewId} en échec : ${err.message}`);
});

console.log("[review-worker] démarré, en écoute sur la file « review-replies »");

// Arrêt propre : laisse les jobs en cours se terminer avant de couper la
// connexion Redis, plutôt que de les interrompre à mi-publication.
async function shutdown(signal: string) {
  console.log(`[review-worker] signal ${signal} reçu, arrêt en cours…`);
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
