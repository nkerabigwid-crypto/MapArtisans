// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.

/**
 * Géométrie de la Geo-Grid.
 *
 * Google ne classe pas un établissement dans l'absolu : il le classe POUR UN
 * POINT DONNÉ. Le même plombier peut être premier depuis le centre-ville et
 * introuvable depuis un quartier situé à deux kilomètres. Une position unique
 * ne veut donc rien dire ; c'est la carte des positions qui informe.
 *
 * Ce module ne fait que produire les points à interroger. Aucun réseau, aucune
 * base : la géométrie doit se vérifier sans monter d'infrastructure.
 */

/** Points par côté. 3 × 3 = 9 interrogations par mot-clé et par relevé. */
export const COTE_GRILLE = 3;

/**
 * Espacement entre deux points, en kilomètres.
 *
 * 1,5 km couvre une commune de taille moyenne dans les 3 km de côté de la
 * grille. Plus serré, les neuf points renverraient le même classement et le
 * relevé n'apprendrait rien ; plus large, on sortirait de la zone où l'artisan
 * se déplace réellement et les points extérieurs seraient toujours rouges.
 */
export const PAS_KM = 1.5;

/** Un degré de latitude vaut ~111,32 km partout sur le globe. */
const KM_PAR_DEGRE_LAT = 111.32;

export interface PointGrille {
  /** Repère de lecture, A1 en haut à gauche à C3 en bas à droite. */
  label: string;
  /**
   * Situation du point par rapport à la fiche.
   *
   * Un nom de quartier serait plus parlant, mais l'obtenir demanderait un
   * géocodage inverse facturé à chaque point, à chaque relevé, pour chaque
   * client. « Nord-est » est gratuit, exact, et l'artisan connaît sa ville.
   */
  zone: string;
  lat: number;
  lng: number;
}

const ZONES = [
  ["Nord-ouest", "Nord", "Nord-est"],
  ["Ouest", "Centre", "Est"],
  ["Sud-ouest", "Sud", "Sud-est"],
];

/**
 * Construit la grille centrée sur la fiche.
 *
 * La conversion des kilomètres en degrés diffère selon l'axe : un degré de
 * longitude se rétrécit à mesure qu'on monte vers les pôles. À Sion, 46,2° de
 * latitude, il ne vaut plus que 77 km contre 111 à l'équateur. Ignorer ce
 * facteur donnerait une grille étirée d'un tiers en largeur — les points
 * extérieurs tomberaient hors de la zone desservie.
 */
export function construireGrille(
  centre: { lat: number; lng: number },
  pasKm: number = PAS_KM,
): PointGrille[] {
  const pasLat = pasKm / KM_PAR_DEGRE_LAT;
  const pasLng = pasKm / (KM_PAR_DEGRE_LAT * Math.cos((centre.lat * Math.PI) / 180));

  const milieu = Math.floor(COTE_GRILLE / 2);
  const points: PointGrille[] = [];

  for (let ligne = 0; ligne < COTE_GRILLE; ligne += 1) {
    for (let colonne = 0; colonne < COTE_GRILLE; colonne += 1) {
      points.push({
        label: `${String.fromCharCode(65 + ligne)}${colonne + 1}`,
        zone: ZONES[ligne][colonne],
        // La ligne 0 est au NORD, donc en latitude PLUS haute : le signe
        // s'inverse par rapport à l'index, qui croît vers le bas de l'écran.
        lat: centre.lat + (milieu - ligne) * pasLat,
        lng: centre.lng + (colonne - milieu) * pasLng,
      });
    }
  }
  return points;
}

/**
 * Rayon à passer à l'API Places pour un point.
 *
 * La moitié du pas : chaque point interroge sa propre case sans empiéter sur
 * celle du voisin. Un rayon plus large ferait remonter les mêmes concurrents
 * partout et lisserait justement ce que la grille cherche à montrer.
 */
export function rayonMetres(pasKm: number = PAS_KM): number {
  return Math.round((pasKm / 2) * 1000);
}
