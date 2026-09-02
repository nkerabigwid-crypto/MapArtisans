// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.

/**
 * Essai gratuit.
 *
 * CE MODULE EXISTE PARCE QUE LA PROMESSE ÉTAIT PUBLIQUE ET NON TENUE
 *
 * Le site annonçait un essai gratuit sans carte bancaire, et rien ne
 * l'implémentait : ni date de fin, ni accès accordé, ni coupure. Un compte
 * naissait `incomplete` et n'obtenait jamais rien.
 *
 * Logique PURE, sans base ni réseau : elle est appelée aussi bien par les
 * écrans que par les workers, et une décision d'accès doit se tester sans
 * monter d'infrastructure.
 */

/**
 * Durée de l'essai.
 *
 * QUATORZE JOURS, ET LA RAISON N'EST PAS « PLUS DE TEMPS »
 *
 * Avec sept jours, l'artisan reçoit UN rapport hebdomadaire : une photo de sa
 * position. Avec quatorze, il en reçoit DEUX — et deux relevés font apparaître
 * un mouvement. C'est le mouvement qu'on vend, pas la photo.
 *
 * S'y ajoute une réalité du métier : une semaine de chantiers passe sans qu'on
 * ouvre quoi que ce soit. Quatorze jours laissent la place à un imprévu sans
 * que l'essai soit perdu.
 *
 * Le coût de l'allongement est faible — quelques francs d'IA et de SMS par
 * essai — face à un abonnement à 49 CHF par mois.
 */
export const DUREE_ESSAI_JOURS = 14;

export interface EtatAbonnement {
  subscriptionStatus: "incomplete" | "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
}

export type MotifBlocage =
  | "essai-termine"
  | "resilie"
  | "jamais-active"
  /** Inscrit, fiche pas encore rattachée : l'essai n'a pas commencé à courir. */
  | "essai-pas-demarre";

export interface VerdictAcces {
  /**
   * L'artisan peut-il ENTRER dans le produit ?
   *
   * Distinct de `travailler`, et la nuance compte : un inscrit dont la fiche
   * n'est pas rattachée doit pouvoir entrer — c'est précisément là qu'il la
   * branche — alors que rien ne doit encore être dépensé pour lui.
   */
  ok: boolean;
  /**
   * Le produit doit-il DÉPENSER pour ce compte ? Génération IA, envoi de SMS,
   * relevé de position.
   *
   * Toujours `false` quand `ok` est faux. Faux aussi avant le démarrage de
   * l'essai : sans cette séparation, un statut `trialing` posé à la main sans
   * date de fin ouvrirait le produit pour toujours.
   */
  travailler: boolean;
  motif?: MotifBlocage;
  /** Jours entiers restants d'essai. `null` hors essai. */
  joursRestants: number | null;
  /** `true` dans les deux derniers jours : de quoi prévenir avant de couper. */
  bientotFini: boolean;
}

export function finEssai(depuis: Date = new Date()): Date {
  return new Date(depuis.getTime() + DUREE_ESSAI_JOURS * 24 * 3600 * 1000);
}

/**
 * Jours entiers restants, arrondis au SUPÉRIEUR.
 *
 * Un essai qui se termine dans deux heures affiche « 1 jour » et non « 0 » :
 * annoncer zéro à quelqu'un qui a encore accès est incompréhensible, et le
 * pousse à croire que le produit s'est déjà coupé.
 */
export function joursRestants(fin: Date | null, maintenant: Date = new Date()): number | null {
  if (!fin) return null;
  const ms = fin.getTime() - maintenant.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 3600 * 1000));
}

/**
 * Le produit doit-il travailler pour ce compte ?
 *
 * Appelé AVANT toute dépense — génération IA, envoi de SMS, relevé de position.
 * Un essai expiré qui continue de consommer est une perte sèche, et le compte
 * n'a jamais rien payé.
 */
export function accesAutorise(
  etat: EtatAbonnement,
  maintenant: Date = new Date(),
): VerdictAcces {
  const restants = joursRestants(etat.trialEndsAt, maintenant);
  const bientotFini = restants !== null && restants > 0 && restants <= 2;

  switch (etat.subscriptionStatus) {
    case "active":
      return { ok: true, travailler: true, joursRestants: null, bientotFini: false };

    case "past_due": {
      /*
       * Client PAYANT dont le prélèvement a échoué : il continue de travailler
       * jusqu'à la fin du délai de grâce. Le couper n'accélère pas le paiement
       * et abîme la relation avec quelqu'un qui a déjà payé plusieurs mois.
       */
      const grace = etat.gracePeriodEndsAt;
      if (!grace || grace.getTime() > maintenant.getTime()) {
        return { ok: true, travailler: true, joursRestants: null, bientotFini: false };
      }
      return {
        ok: false,
        travailler: false,
        motif: "resilie",
        joursRestants: null,
        bientotFini: false,
      };
    }

    case "trialing":
      if (restants !== null && restants > 0) {
        return { ok: true, travailler: true, joursRestants: restants, bientotFini };
      }
      /*
       * PAS DE DATE DE FIN : l'essai n'a pas encore commencé à courir.
       *
       * C'est l'état normal d'un inscrit dont la fiche Google n'est pas
       * rattachée — migration 026. Il doit pouvoir entrer et brancher sa
       * fiche ; le refuser afficherait « votre essai est terminé » à
       * quelqu'un qui vient de s'inscrire.
       *
       * Cet accès ne coûte rien : sans fiche, les files n'ont rien à traiter.
       * Et le jour où la fiche se branche, `demarrerEssaiSiPremiereFiche` pose
       * les deux dates dans la même instruction — il n'existe donc pas d'état
       * durable « fiche rattachée, essai sans échéance ».
       */
      if (etat.trialEndsAt === null) {
        return {
          ok: true,
          // Entrer, oui. Dépenser, non : rien n'est encore dû à ce compte, et
          // c'est ce refus qui empêche un `trialing` sans date d'ouvrir le
          // produit indéfiniment.
          travailler: false,
          motif: "essai-pas-demarre",
          joursRestants: null,
          bientotFini: false,
        };
      }
      return {
        ok: false,
        travailler: false,
        motif: "essai-termine",
        joursRestants: 0,
        bientotFini: false,
      };

    case "canceled":
      return {
        ok: false,
        travailler: false,
        motif: "resilie",
        joursRestants: null,
        bientotFini: false,
      };

    case "incomplete":
    default:
      // Compte créé, essai jamais démarré et aucun paiement. Se produit pour
      // les comptes antérieurs à cette migration.
      return {
        ok: false,
        travailler: false,
        motif: "jamais-active",
        joursRestants: null,
        bientotFini: false,
      };
  }
}

/** Message affiché à l'artisan quand l'accès est refusé. */
export function messageBlocage(motif: MotifBlocage): string {
  switch (motif) {
    case "essai-termine":
      return "Votre essai gratuit est terminé. Choisissez une formule pour reprendre là où vous en étiez — vos avis et vos réglages sont conservés.";
    case "resilie":
      return "Votre abonnement est arrêté. Réactivez-le pour retrouver votre fiche et son historique.";
    case "jamais-active":
      return "Activez votre essai gratuit de quatorze jours pour commencer, sans carte bancaire.";
    case "essai-pas-demarre":
      // Ce texte ne s'affiche pas comme un blocage : l'accès est ouvert. Il
      // existe pour que le motif soit lisible dans les journaux et les tests.
      return "Vos quatorze jours d'essai démarreront au rattachement de votre fiche Google.";
  }
}
