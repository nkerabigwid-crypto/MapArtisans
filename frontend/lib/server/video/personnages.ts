// PAS de `import "server-only"` : importé par un worker hors du bundler Next —
// voir la note détaillée en tête de lib/server/ai/openai.ts.

/**
 * Attribution du personnage qui parle au nom de l'artisan.
 *
 * DEUX RÈGLES, ET ELLES SONT TOUTES DEUX INDISPENSABLES
 *
 * 1. STABLE. Le personnage est tiré une fois et ne change plus. Un visage
 *    différent chaque mois et la clientèle ne reconnaît jamais « son »
 *    porte-parole — on perd exactement ce qu'on vend, à savoir que la vidéo
 *    soit la sienne.
 *
 * 2. SANS COLLISION LOCALE. Deux plombiers de la même ville ne doivent jamais
 *    recevoir le même visage. Leurs clientèles se recoupent ; deux fiches
 *    voisines qui publient le même porte-parole, et le procédé se voit —
 *    la personnalisation ne trompe plus personne.
 *
 * POURQUOI DÉTERMINISTE ET NON TIRÉ AU SORT
 *
 * Un tirage aléatoire à l'inscription oblige à stocker le résultat, et une
 * ligne perdue en base fait changer de visage. Ici la même entrée donne
 * toujours la même sortie : le personnage se recalcule, il ne se retrouve pas.
 * Le stockage devient un cache, pas une source de vérité.
 */

/** Les fichiers de public/personnages/. Ajouter en fin de liste seulement :
 *  insérer au milieu redistribuerait les visages de tous les clients. */
export const PERSONNAGES = [
  "01.png",
  "02.png",
  "03.png",
  "04.png",
  "05.png",
  "06.png",
] as const;

export type Personnage = (typeof PERSONNAGES)[number];

/**
 * Empreinte stable d'une chaîne — FNV-1a 32 bits.
 *
 * Pas de `crypto` : cette valeur ne protège rien, elle répartit. Une fonction
 * de hachage cryptographique coûterait plus cher pour le même résultat, et
 * `Math.random()` ne conviendrait pas puisqu'on veut précisément l'inverse du
 * hasard.
 */
export function empreinte(valeur: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < valeur.length; i++) {
    h ^= valeur.charCodeAt(i);
    // Multiplication par 16777619 en arithmétique 32 bits non signée.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Choisit le personnage d'un profil.
 *
 * `dejaPris` liste les personnages déjà attribués aux AUTRES artisans du même
 * couple ville/métier. L'appelant fait la requête ; cette fonction reste pure,
 * donc testable sans base de données.
 *
 * Si tous les personnages sont pris — plus de six plombiers dans la même
 * ville — on retombe sur le choix naturel plutôt que d'échouer. Mieux vaut
 * deux visages identiques dans une ville très fournie qu'un post non publié.
 */
export function choisirPersonnage(
  profilId: string,
  dejaPris: readonly string[] = [],
): Personnage {
  const depart = empreinte(profilId) % PERSONNAGES.length;
  const pris = new Set(dejaPris);

  for (let ecart = 0; ecart < PERSONNAGES.length; ecart++) {
    const candidat = PERSONNAGES[(depart + ecart) % PERSONNAGES.length];
    if (!pris.has(candidat)) return candidat;
  }

  return PERSONNAGES[depart];
}

/**
 * URL publique du personnage.
 *
 * Les fichiers vivent dans public/personnages/, donc servis par le site.
 * fal.ai doit pouvoir les atteindre : en production l'URL suffit, mais en
 * développement `localhost` lui est inaccessible — c'est alors le
 * téléversement de lib/server/video/fal.ts qui prend le relais.
 */
export function urlPersonnage(personnage: Personnage, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/personnages/${personnage}`;
}
