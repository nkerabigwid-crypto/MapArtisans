// PAS de `import "server-only"` : importé par un worker hors du bundler Next —
// voir la note détaillée en tête de lib/server/ai/openai.ts.
import { TRADES } from "@/lib/trades";

/**
 * Attribution du personnage qui parle au nom de l'artisan.
 *
 * TROIS RÈGLES, ET ELLES SONT TOUTES INDISPENSABLES
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
 * 3. ACCORDÉ AU MÉTIER, DEPUIS le 13 septembre 2026. La bibliothèque était un
 *    unique lot de six visages partagé par tous les métiers — un chauffeur de
 *    taxi pouvait hériter d'un personnage en tenue de plombier. Chaque métier
 *    a maintenant son propre lot de six, choisi avec la même logique.
 *
 * POURQUOI DÉTERMINISTE ET NON TIRÉ AU SORT
 *
 * Un tirage aléatoire à l'inscription oblige à stocker le résultat, et une
 * ligne perdue en base fait changer de visage. Ici la même entrée donne
 * toujours la même sortie : le personnage se recalcule, il ne se retrouve pas.
 * Le stockage devient un cache, pas une source de vérité.
 */

/**
 * Les fichiers de public/personnages/, par métier. Ajouter en fin de chaque
 * liste seulement : insérer au milieu redistribuerait les visages de tous les
 * clients de ce métier.
 *
 * Les clés suivent exactement `Trade.value` de lib/trades.ts — voir
 * `verifierCompletude` dans tenues.ts, qui échoue si l'une manque.
 */
export const PERSONNAGES: Record<string, readonly string[]> = {
  plombier: ["plombier-01.png", "plombier-02.png", "plombier-03.png", "plombier-04.png", "plombier-05.png", "plombier-06.png"],
  electricien: ["electricien-01.png", "electricien-02.png", "electricien-03.png", "electricien-04.png", "electricien-05.png", "electricien-06.png"],
  chauffagiste: ["chauffagiste-01.png", "chauffagiste-02.png", "chauffagiste-03.png", "chauffagiste-04.png", "chauffagiste-05.png", "chauffagiste-06.png"],
  serrurier: ["serrurier-01.png", "serrurier-02.png", "serrurier-03.png", "serrurier-04.png", "serrurier-05.png", "serrurier-06.png"],
  menuisier: ["menuisier-01.png", "menuisier-02.png", "menuisier-03.png", "menuisier-04.png", "menuisier-05.png", "menuisier-06.png"],
  peintre: ["peintre-01.png", "peintre-02.png", "peintre-03.png", "peintre-04.png", "peintre-05.png", "peintre-06.png"],
  macon: ["macon-01.png", "macon-02.png", "macon-03.png", "macon-04.png", "macon-05.png", "macon-06.png"],
  couvreur: ["couvreur-01.png", "couvreur-02.png", "couvreur-03.png", "couvreur-04.png", "couvreur-05.png", "couvreur-06.png"],
  vitrier: ["vitrier-01.png", "vitrier-02.png", "vitrier-03.png", "vitrier-04.png", "vitrier-05.png", "vitrier-06.png"],
  carreleur: ["carreleur-01.png", "carreleur-02.png", "carreleur-03.png", "carreleur-04.png", "carreleur-05.png", "carreleur-06.png"],
  taxi: ["taxi-01.png", "taxi-02.png", "taxi-03.png", "taxi-04.png", "taxi-05.png", "taxi-06.png"],
  vtc: ["vtc-01.png", "vtc-02.png", "vtc-03.png", "vtc-04.png", "vtc-05.png", "vtc-06.png"],
  transfert_aeroport: ["transfert_aeroport-01.png", "transfert_aeroport-02.png", "transfert_aeroport-03.png", "transfert_aeroport-04.png", "transfert_aeroport-05.png", "transfert_aeroport-06.png"],
  garage: ["garage-01.png", "garage-02.png", "garage-03.png", "garage-04.png", "garage-05.png", "garage-06.png"],
  carrosserie: ["carrosserie-01.png", "carrosserie-02.png", "carrosserie-03.png", "carrosserie-04.png", "carrosserie-05.png", "carrosserie-06.png"],
  depannage_auto: ["depannage_auto-01.png", "depannage_auto-02.png", "depannage_auto-03.png", "depannage_auto-04.png", "depannage_auto-05.png", "depannage_auto-06.png"],
  coiffeur: ["coiffeur-01.png", "coiffeur-02.png", "coiffeur-03.png", "coiffeur-04.png", "coiffeur-05.png", "coiffeur-06.png"],
  barbier: ["barbier-01.png", "barbier-02.png", "barbier-03.png", "barbier-04.png", "barbier-05.png", "barbier-06.png"],
  institut_beaute: ["institut_beaute-01.png", "institut_beaute-02.png", "institut_beaute-03.png", "institut_beaute-04.png", "institut_beaute-05.png", "institut_beaute-06.png"],
  // Les six fichiers hérités de l'ancienne bibliothèque unique — générés avant
  // le passage au découpage par métier, réaffectés à « Autre » plutôt que
  // regénérés en double.
  autre: ["01.png", "02.png", "03.png", "04.png", "05.png", "06.png"],
};

export type Personnage = string;

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
 * Choisit le personnage d'un profil, dans la bibliothèque de SON métier.
 *
 * `metier` absent du catalogue (fiche legacy, valeur corrompue) retombe sur
 * « autre » plutôt que d'échouer — voir `resolveTradeOrDefault` dans
 * lib/trades.ts pour la même tolérance côté génération de texte.
 *
 * `dejaPris` liste les personnages déjà attribués aux AUTRES artisans du même
 * couple ville/métier. L'appelant fait la requête ; cette fonction reste pure,
 * donc testable sans base de données.
 *
 * Si tous les personnages du métier sont pris — plus de six plombiers dans la
 * même ville — on retombe sur le choix naturel plutôt que d'échouer. Mieux
 * vaut deux visages identiques dans une ville très fournie qu'un post non
 * publié.
 */
export function choisirPersonnage(
  profilId: string,
  metier: string,
  dejaPris: readonly string[] = [],
): Personnage {
  const bibliotheque = PERSONNAGES[metier] ?? PERSONNAGES.autre;
  const depart = empreinte(profilId) % bibliotheque.length;
  const pris = new Set(dejaPris);

  for (let ecart = 0; ecart < bibliotheque.length; ecart++) {
    const candidat = bibliotheque[(depart + ecart) % bibliotheque.length];
    if (!pris.has(candidat)) return candidat;
  }

  return bibliotheque[depart];
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

/** Vrai si tous les métiers de lib/trades.ts ont une bibliothèque ici. */
export function bibliothequeComplete(): boolean {
  return TRADES.every((t) => Array.isArray(PERSONNAGES[t.value]) && PERSONNAGES[t.value].length > 0);
}
