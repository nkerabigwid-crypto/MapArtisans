// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.

/**
 * Politique de traitement des avis — partagée par le worker et le générateur.
 *
 * Ce fichier existe pour une raison précise : la note pilote DEUX décisions
 * distinctes, prises dans deux modules différents, et elles doivent rester
 * cohérentes.
 *
 *   · reviewWorker.ts : publier automatiquement, ou laisser en validation.
 *   · ai/openai.ts    : rédiger avec ancrage SEO local, ou sans aucun mot-clé.
 *
 * Les faire dériver l'une de l'autre donnerait le pire cas possible : une
 * réponse rédigée pour le référencement, bourrée de « plombier à Lausanne »,
 * publiée sous un avis à 2 étoiles.
 *
 * Le générateur ne peut pas importer le worker (le worker importe déjà le
 * générateur — ce serait un cycle), d'où ce module neutre dont les deux
 * dépendent.
 */

/**
 * Note à partir de laquelle un avis est traité comme positif.
 *
 * 3 étoiles compte comme négatif : c'est une insatisfaction exprimée poliment,
 * et elle appelle la même prudence qu'un 1 — pas de publication sans relecture,
 * et surtout pas d'optimisation SEO.
 */
export const AUTO_REPLY_MIN_RATING = 4;

export function estAvisPositif(rating: number): boolean {
  return rating >= AUTO_REPLY_MIN_RATING;
}
