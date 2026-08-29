// PAS de `import "server-only"` ici, volontairement : ce module est aussi
// importé par workers/reviewWorker.ts, qui tourne comme un processus Node
// autonome, hors du bundler de Next. Le paquet `server-only` lève de façon
// INCONDITIONNELLE dès qu'il est chargé ailleurs que sous le bundler de Next
// (c'est ce dernier, et lui seul, qui sait le neutraliser) — l'ajouter ici
// ferait planter le worker au démarrage. La frontière réelle est déjà tenue
// autrement : rien sous lib/server/ n'est importé par un composant "use
// client" (vérifié), et chaque route Next qui l'utilise déclare elle-même
// `export const runtime = "nodejs"`.
import IORedis from "ioredis";

/**
 * Connexion Redis partagée par la file et le worker.
 *
 * `maxRetriesPerRequest: null` est une exigence documentée de BullMQ, pas une
 * préférence : la bibliothèque bloque en interne sur les commandes bloquantes
 * (BRPOPLPUSH et consorts), et le retry automatique d'ioredis sur ces
 * commandes interagit mal avec cette attente. Le laisser à sa valeur par
 * défaut produit des jobs qui semblent se perdre sans erreur visible.
 */
let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (connection) return connection;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL absente. En développement : lancez un Redis local et " +
        "exportez REDIS_URL=redis://localhost:6379. En production : l'URL du " +
        "Redis managé de l'hébergeur.",
    );
  }

  connection = new IORedis(url, { maxRetriesPerRequest: null });
  return connection;
}

/** Réservé aux tests : force une nouvelle connexion vers une autre URL. */
export function __resetConnection() {
  connection?.disconnect();
  connection = null;
}
