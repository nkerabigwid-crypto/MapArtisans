/**
 * Adresse canonique du site.
 *
 * Une seule source pour le plan du site, robots.txt et les balises de partage.
 * Les quatre domaines secondaires redirigent en 301 vers celui-ci : déclarer
 * une autre adresse ici créerait des URL canoniques contradictoires, ce qui
 * dilue exactement le référencement que le produit promet d'améliorer.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://mapartisans.com";
