/**
 * Témoignages clients.
 *
 * VIDE, ET CE N'EST PAS UN OUBLI
 *
 * MapArtisans n'a aucun client au 31 août 2026. Tout témoignage affiché
 * aujourd'hui serait inventé — et publier de faux avis clients est une
 * indication inexacte au sens de la LCD (art. 3 al. 1 let. b), passible de
 * sanctions civiles et pénales.
 *
 * C'est aussi absurde commercialement pour ce produit précisément : on vend
 * la conformité et le refus des avis truqués. Un site qui affiche de faux
 * témoignages en vendant l'authenticité des avis ne survit pas à la première
 * personne qui cherche « James L., Taxi Fleet Owner » sur un moteur.
 *
 * COMMENT LE REMPLIR
 *
 * Un témoignage n'entre ici qu'avec l'accord écrit de son auteur, son vrai
 * nom, sa vraie entreprise. Les chiffres cités doivent être mesurables dans
 * le tableau de bord de ce client — un « +40 % d'appels » qu'on ne peut pas
 * montrer est une affirmation invérifiable de plus.
 */

export interface Temoignage {
  /** Nom réel, avec l'accord de la personne. */
  auteur: string;
  /** Entreprise réelle. */
  entreprise: string;
  ville: string;
  metier: string;
  /** Ses mots, pas les nôtres. */
  citation: string;
  /**
   * Chiffre mis en avant, s'il y en a un. Il DOIT être visible dans le
   * tableau de bord de ce client : un chiffre invérifiable est une promesse
   * déguisée, et c'est exactement ce que nous reprochons à la concurrence.
   */
  chiffre?: { valeur: string; libelle: string };
}

export const TEMOIGNAGES: Temoignage[] = [];

/** Y a-t-il de quoi afficher une section ? Un seul témoignage fait pauvre. */
export function assezDeTemoignages(): boolean {
  return TEMOIGNAGES.length >= 2;
}
