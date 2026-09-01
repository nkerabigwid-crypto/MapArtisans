// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import type { PlanId } from "@/lib/data";

/**
 * Plafond mensuel de SMS par palier.
 *
 * POURQUOI CE PLAFOND EXISTE
 *
 * Le SMS est le seul coût variable non borné du produit. Un SMS suisse revient
 * à 5–10 centimes, soit dix à cinquante fois une réponse générée par l'IA —
 * dont la dépense, elle, est déjà plafonnée par `max_tokens` et par le quota
 * quotidien de l'assistant.
 *
 * Sans borne, un artisan très actif peut envoyer plusieurs centaines de
 * demandes d'avis par mois. La facture Twilio arrive après coup, et rien ne
 * l'annonce : c'est exactement le mode de panne qu'on veut éviter.
 */

/**
 * Les plafonds sont larges à dessein.
 *
 * Ils ne servent pas à rationner un usage normal — un artisan qui envoie une
 * demande après chaque intervention reste très en dessous. Ils servent à
 * arrêter l'anormal : une boucle, un import de fichier clients, un essai qui
 * dérape. Un plafond serré transformerait une protection en irritant
 * quotidien, et le premier client à le heurter aurait raison de se plaindre.
 */
export const PLAFOND_MENSUEL: Record<PlanId, number> = {
  /*
   * CES PLAFONDS SONT DES PLAFONDS DE DÉPENSE, PAS DE RATIONNEMENT.
   *
   * La demande d'avis tient sur DEUX segments depuis qu'elle porte le lien de
   * désabonnement : chaque envoi coûte donc le double. Les plafonds
   * précédents — 120, 250, 500 — laissaient la facture SMS atteindre 38 à
   * 53 % du prix de l'abonnement, ce qui n'était pas tenable.
   *
   * À 60 / 150 / 300, le pire cas reste sous un tiers du prix — 19 % en
   * Basique, 32 % en Professionnel. C'est plus généreux que le strict
   * nécessaire, et c'est délibéré : un plafond sert à arrêter l'anormal, pas à
   * rationner l'usage normal. Un artisan qui envoie une demande après chaque
   * chantier ne doit jamais le rencontrer.
   *
   * Le pire cas suppose en outre que TOUT le plafond parte en demandes d'avis
   * à deux segments. En pratique, une trentaine d'envois par mois coûtent
   * environ 5 CHF, soit 3 à 11 % selon le palier.
   */
  basique: 60,
  essentiel: 150,
  professionnel: 300,
};

/**
 * Types d'envoi, distingués pour une seule raison : le rapport hebdomadaire
 * n'est JAMAIS bloqué.
 *
 * Il coûte quatre à cinq SMS par mois, c'est prévisible, et c'est la promesse
 * centrale vendue à l'artisan — « un SMS par semaine ». Le couper pour
 * économiser trente centimes reviendrait à ne pas livrer ce qu'il a payé,
 * précisément le mois où il utilise le plus le produit.
 *
 * Il est en revanche COMPTÉ : le plafond doit refléter la dépense réelle.
 */
export type TypeSms = "rapport" | "demande-avis" | "rendez-vous";

const TOUJOURS_ENVOYES: TypeSms[] = ["rapport"];

/** Seuil d'alerte, en proportion du plafond. */
export const SEUIL_ALERTE = 0.8;

export type RefusQuota = "plafond-atteint";

export interface VerdictQuota {
  ok: boolean;
  raison?: RefusQuota;
  /** Envois restants avant le plafond. Négatif si le rapport l'a dépassé. */
  restants: number;
  /** `true` au-delà de 80 % : de quoi prévenir avant de bloquer. */
  proche: boolean;
}

export function plafondPour(plan: string): number {
  // Un palier inconnu retombe sur le plus bas plutôt que sur le plus haut :
  // le cas se présente si un palier est retiré alors que des comptes le
  // portent encore, et sous-estimer coûte moins cher que l'inverse.
  return PLAFOND_MENSUEL[plan as PlanId] ?? PLAFOND_MENSUEL.basique;
}

export function autoriserEnvoi(
  plan: string,
  envoyesCeMois: number,
  type: TypeSms,
): VerdictQuota {
  const plafond = plafondPour(plan);
  const restants = plafond - envoyesCeMois;
  const proche = envoyesCeMois >= plafond * SEUIL_ALERTE;

  if (TOUJOURS_ENVOYES.includes(type)) {
    return { ok: true, restants, proche };
  }
  if (restants <= 0) {
    return { ok: false, raison: "plafond-atteint", restants, proche: true };
  }
  return { ok: true, restants, proche };
}

/** Message rendu à l'artisan. Il doit comprendre quoi faire, pas seulement que ça bloque. */
/** Libellés affichés. Un identifiant technique ne se montre jamais au client. */
const LIBELLE: Record<PlanId, string> = {
  basique: "Basique",
  essentiel: "Essentiel",
  professionnel: "Professionnel",
};

/**
 * Palier immédiatement supérieur, ou `null` au sommet de la grille.
 */
export function palierSuivant(plan: string): PlanId | null {
  const ordre: PlanId[] = ["basique", "essentiel", "professionnel"];
  const i = ordre.indexOf(plan as PlanId);
  return i >= 0 && i < ordre.length - 1 ? ordre[i + 1] : null;
}

/**
 * Message affiché quand le plafond est atteint.
 *
 * IL PROPOSE LE PALIER SUPÉRIEUR, IL NE DEMANDE PAS D'ÉCRIRE
 *
 * La version précédente disait « pour l'augmenter, écrivez-nous » — une
 * impasse au moment précis où l'artisan est le plus engagé : il vient de finir
 * un chantier et veut demander un avis. Lui répondre par une adresse e-mail,
 * c'est perdre une vente quand l'intention est maximale.
 *
 * Au sommet de la grille il n'y a rien à proposer : le contact direct redevient
 * la bonne réponse.
 */
export function messageQuota(plan: string): string {
  const plafond = plafondPour(plan);
  const suivant = palierSuivant(plan);
  const base = `Vous avez envoyé vos ${plafond} SMS du mois. Le compteur repart le 1er.`;
  if (!suivant) return `${base} Pour un plafond plus élevé, écrivez-nous.`;
  return (
    `${base} La formule ${LIBELLE[suivant]} en inclut ${PLAFOND_MENSUEL[suivant]} : ` +
    "vous pouvez y passer dès maintenant, sans interruption."
  );
}

/**
 * Message d'avertissement, AVANT le mur.
 *
 * Prévenir à 80 % laisse le temps de décider ; découvrir la limite en pleine
 * journée de chantier, non. C'est aussi le moment où la montée en gamme est la
 * mieux reçue : l'artisan constate de lui-même qu'il utilise beaucoup le
 * produit — personne n'a besoin de le lui dire.
 */
export function messageApproche(plan: string, envoyes: number): string | null {
  const plafond = plafondPour(plan);
  const restants = plafond - envoyes;
  if (restants <= 0) return null;
  const suivant = palierSuivant(plan);
  const base = `Il vous reste ${restants} SMS ce mois-ci sur ${plafond}.`;
  if (!suivant) return base;
  return `${base} La formule ${LIBELLE[suivant]} en inclut ${PLAFOND_MENSUEL[suivant]}.`;
}
