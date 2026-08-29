// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { measureSms } from "./gsm7";

/**
 * Rédaction du rapport SMS hebdomadaire.
 *
 * C'est la promesse commerciale centrale : « pas de tableau de bord, un SMS le
 * vendredi ». Deux contraintes gouvernent donc ce fichier :
 *
 * 1. **Un seul segment.** Au-delà de 160 caractères GSM-7, Twilio facture
 *    plusieurs segments. Sur un parc d'un millier d'artisans, passer de 1 à 2
 *    segments double la ligne SMS du compte d'exploitation.
 *
 * 2. **Aucun caractère hors GSM-7.** Un seul « ê » ou « û » fait basculer le
 *    message entier en UCS-2, où la limite tombe à 70 caractères — le rapport
 *    passerait alors à 3 segments. D'où « voila » sans accent circonflexe et
 *    l'absence de « êtes » dans les formulations ci-dessous : ce sont des
 *    choix de coût, pas des fautes.
 */

export interface WeeklyReportData {
  businessName: string;
  /**
   * Marque affichée en tête du SMS. `null` pour les clients directs, qui
   * reçoivent « MapArtisans » ; le nom de l'agence en marque blanche sinon —
   * un artisan passé par une agence ne doit jamais voir notre nom.
   */
  brandName?: string | null;
  /** Meilleure position relevée cette semaine ; null si introuvable partout. */
  bestPosition: number | null;
  /** Position de la semaine précédente, pour l'évolution. null si première. */
  previousPosition: number | null;
  callsGenerated: number;
  directionsGenerated: number;
  /** Avis en attente de validation, si la réponse auto est désactivée. */
  pendingReviews: number;
}

/** Ordinal français : « 1re » au premier rang, « Ne » ensuite. */
function ordinal(n: number): string {
  return n === 1 ? "1re" : `${n}e`;
}

/**
 * Budget de caractères réservé à la marque.
 *
 * Le reste du rapport occupe au pire 81 unités (mesuré par les tests). Sur les
 * 160 disponibles en GSM-7, on plafonne donc la marque à 40 : au-delà, un nom
 * d'agence à rallonge ferait passer le SMS à deux segments, et doublerait la
 * facture de TOUS les artisans de cette agence.
 */
const MARQUE_MAX = 40;

/**
 * Réduit la marque au budget, sans couper au milieu d'un mot quand c'est
 * évitable. Le repli sur « MapArtisans » n'a pas lieu ici : une agence dont le
 * nom est trop long doit voir son nom raccourci, pas remplacé par le nôtre.
 */
function marqueTronquee(nom: string): string {
  const propre = nom.trim();
  if (propre.length <= MARQUE_MAX) return propre;
  const coupe = propre.slice(0, MARQUE_MAX);
  const espace = coupe.lastIndexOf(" ");
  return (espace > MARQUE_MAX / 2 ? coupe.slice(0, espace) : coupe).trimEnd();
}

/**
 * Compose le rapport. Le nom de l'entreprise est volontairement absent : le
 * destinataire sait de quelle entreprise il s'agit, et chaque caractère
 * économisé éloigne du basculement à deux segments.
 */
export function composeWeeklyReport(data: WeeklyReportData): string {
  const marque = data.brandName?.trim()
    ? marqueTronquee(data.brandName)
    : "MapArtisans";
  const parts: string[] = [marque];

  if (data.bestPosition === null) {
    parts.push("fiche introuvable cette semaine");
  } else {
    let position = `position ${ordinal(data.bestPosition)}`;
    if (data.previousPosition !== null && data.previousPosition !== data.bestPosition) {
      const delta = data.previousPosition - data.bestPosition;
      // « +2 » se lit comme un gain de deux places, ce qui est l'inverse du
      // signe arithmetique sur le rang — d'ou la conversion explicite.
      position += delta > 0 ? ` (+${delta})` : ` (${delta})`;
    }
    parts.push(position);
  }

  parts.push(`${data.callsGenerated} appels`);
  parts.push(`${data.directionsGenerated} itineraires`);

  if (data.pendingReviews > 0) {
    parts.push(
      data.pendingReviews === 1 ? "1 avis a valider" : `${data.pendingReviews} avis a valider`,
    );
  }

  return parts.join(" - ") + ".";
}

/**
 * Vérifie qu'un rapport tient en un segment GSM-7.
 * Exporté pour que les tests puissent l'exercer sur des valeurs extrêmes.
 */
export function reportFitsOneSegment(body: string): boolean {
  const cost = measureSms(body);
  return cost.segments === 1 && cost.encoding === "GSM-7";
}
