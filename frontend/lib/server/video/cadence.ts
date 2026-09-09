// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { isoWeekKey } from "@/lib/server/queue/reportQueue";

/**
 * Combien de vidéos, et quand.
 *
 * LA CADENCE EST UN PRIX, PAS UN RÉGLAGE
 *
 * Chaque palier a été calculé contre son propre revenu, au tarif fal.ai de
 * 0,15 $ la seconde en 720p, pour des scripts bornés à 220 caractères :
 *
 *     Basique        49 CHF   1/mois        2,05 CHF   4,2 % du revenu
 *     Essentiel      99 CHF   2/mois        4,09 CHF   4,1 %
 *     Professionnel 149 CHF   1/semaine     8,18 CHF   5,5 %
 *
 * Ces trois lignes sont la raison pour laquelle la fonction s'ajoute SANS
 * toucher aux prix. Changer une cadence ici, c'est refaire ce calcul — et
 * possiblement découvrir qu'un palier ne se finance plus.
 *
 * POURQUOI UNE CLÉ DE PÉRIODE ET NON UN COMPTEUR
 *
 * Un compteur « vidéos ce mois-ci » se désynchronise : deux instances du
 * planificateur pendant un déploiement, et il est incrémenté deux fois — ou
 * pas du tout. Une clé de période est idempotente par construction : le même
 * instant donne toujours la même clé, et l'unicité en base fait le reste
 * (voir la migration 030).
 */

/** Vidéos par mois et par palier. Zéro pour un palier sans vidéo. */
export const VIDEOS_PAR_MOIS: Record<string, number> = {
  basique: 1,
  essentiel: 2,
  professionnel: 4,
};

/**
 * La période facturable en cours pour ce palier.
 *
 * `null` si le palier ne donne droit à aucune vidéo — un palier inconnu en
 * fait partie : mieux vaut ne rien produire que produire à perte pour un
 * identifiant qu'on ne reconnaît pas.
 *
 *     basique        « 2026-09 »     le mois
 *     essentiel      « 2026-09b »    la quinzaine
 *     professionnel  « 2026-W37 »    la semaine ISO
 */
export function clePeriode(planId: string | null | undefined, quand: Date): string | null {
  const parMois = VIDEOS_PAR_MOIS[String(planId)] ?? 0;
  if (parMois === 0) return null;

  const mois = `${quand.getFullYear()}-${String(quand.getMonth() + 1).padStart(2, "0")}`;

  if (parMois === 1) return mois;

  if (parMois === 2) {
    /*
     * La quinzaine plutôt que « deux fois quand ça tombe ».
     *
     * Découper le mois en deux moitiés espace les vidéos d'environ quinze
     * jours. Les produire toutes les deux en début de mois donnerait bien deux
     * vidéos, mais une fiche animée une semaine puis muette pendant trois —
     * or c'est précisément la régularité qu'on vend.
     */
    return `${mois}${quand.getDate() <= 15 ? "a" : "b"}`;
  }

  // Quatre par mois : la semaine ISO. Elle donne parfois cinq périodes dans un
  // mois de cinq semaines, soit une vidéo offerte deux ou trois fois l'an —
  // 0,7 % de revenu en plus sur le palier Professionnel. Assumé : aligner
  // artificiellement sur quatre semaines produirait des écarts de cadence bien
  // plus visibles qu'une vidéo de bonus.
  return isoWeekKey(quand);
}

/** Le palier donne-t-il droit à des posts vidéo ? */
export function paletDonneDroitAVideo(planId: string | null | undefined): boolean {
  return (VIDEOS_PAR_MOIS[String(planId)] ?? 0) > 0;
}
