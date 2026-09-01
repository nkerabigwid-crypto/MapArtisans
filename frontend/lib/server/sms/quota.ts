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
   * À 50 / 100 / 200, le pire cas reste entre 17 et 22 % du prix, quel que
   * soit le palier. Un artisan qui envoie une demande après chaque chantier
   * reste largement en dessous ; celui qui les dépasse a une activité qui
   * justifie le palier supérieur — le plafond le lui dit au bon moment.
   */
  basique: 50,
  essentiel: 100,
  professionnel: 200,
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
export function messageQuota(plan: string): string {
  const plafond = plafondPour(plan);
  return (
    `Vous avez atteint la limite de ${plafond} SMS pour ce mois. ` +
    "Elle repart à zéro le 1er du mois prochain. Pour l'augmenter, écrivez-nous."
  );
}
