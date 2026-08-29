/**
 * Module tracking — classification des positions Geo-Grid.
 *
 * Fonction pure, volontairement sans dépendance : aucun accès réseau, aucune
 * lecture de base. Elle doit pouvoir être appelée depuis la route API qui
 * reçoit un scan, depuis le worker qui calcule des statistiques agrégées, et
 * depuis un test — sans jamais dépendre d'un état externe.
 *
 * Sans `server-only` à dessein : rien ici n'est un secret, et une fonction pure
 * n'a aucune raison d'être bannie du client.
 */

export type GeoGridColor = "green" | "amber" | "red";

export interface GridVisual {
  color: GeoGridColor;
  emoji: "🟢" | "🟡" | "🔴";
  label: string;
}

/**
 * Classifie une position Google Maps selon la règle du Local Pack :
 * Google n'affiche que les trois premiers résultats sans que l'utilisateur ait
 * à interagir. Au-delà, la fiche existe mais n'est structurellement pas vue.
 *
 *   1 à 3   → vert  (zone de conversion maximale — le Local Pack)
 *   4 à 10  → ambre (première page, mais hors du pack — l'argument de vente)
 *   > 10    → rouge (deuxième page ou au-delà — invisible en pratique)
 *   null/0  → rouge (fiche introuvable — traité comme pire que la 10e position :
 *             pour l'artisan, être introuvable et être 40e reviennent au même)
 *
 * `position` est `number | null` et non `number` seul : une position 0 n'a pas
 * de sens métier (Google ne classe pas à partir de 0), donc autoriser `null`
 * pour « non trouvé » évite la valeur sentinelle ambiguë qu'aurait été 0.
 */
export function computeGridVisuals(position: number | null): GridVisual {
  if (position === null || position <= 0 || position > 10) {
    return { color: "red", emoji: "🔴", label: "Hors radar" };
  }
  if (position <= 3) {
    return { color: "green", emoji: "🟢", label: "Visible dans le top 3" };
  }
  return { color: "amber", emoji: "🟡", label: "Première page, mais masquée" };
}

/** Un point relevé lors d'un scan — ce que la route API reçoit. */
export interface ScannedPoint {
  label: string;
  area: string;
  lat: number;
  lng: number;
  position: number | null;
  /** place_id Google du concurrent 1er ici — jamais son nom, voir §Conformité. */
  topCompetitorPlaceId: string | null;
}

export interface ClassifiedPoint extends ScannedPoint {
  visual: GridVisual;
}

/** Applique la classification à l'ensemble des points d'un scan. */
export function classifyScan(points: ScannedPoint[]): ClassifiedPoint[] {
  return points.map((p) => ({ ...p, visual: computeGridVisuals(p.position) }));
}

/**
 * Résumé chiffré d'un scan, pour l'écran « Cette semaine » et le rapport SMS.
 */
export function summarizeScan(points: ClassifiedPoint[]) {
  const total = points.length;
  const green = points.filter((p) => p.visual.color === "green").length;
  const amber = points.filter((p) => p.visual.color === "amber").length;
  const red = points.filter((p) => p.visual.color === "red").length;
  const found = points.filter((p) => p.position !== null);
  const bestPosition = found.length
    ? Math.min(...found.map((p) => p.position as number))
    : null;
  return { total, green, amber, red, bestPosition };
}
