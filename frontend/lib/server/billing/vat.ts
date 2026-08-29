// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.

/**
 * TVA suisse — calcul des montants d'une facture.
 *
 * LE POINT LE PLUS IMPORTANT DE CE FICHIER
 *
 * Le taux normal est de 8,1 %, mais l'assujettissement n'est obligatoire qu'à
 * partir de **100 000 CHF** de chiffre d'affaires annuel (AFC). En dessous,
 * une entreprise n'est pas assujettie — et il lui est alors INTERDIT de faire
 * figurer la TVA sur ses factures : elle percevrait un impôt qu'elle n'a pas le
 * droit d'encaisser, sans numéro IDE/TVA à mentionner.
 *
 * Un SaaS qui vient de naître est en dessous du seuil. Coder « TVA 8,1 % » en
 * dur produirait donc des factures illégales dès la première vente. Le défaut
 * de ce module est par conséquent **non assujetti**, et le passage à
 * l'assujettissement est une décision explicite, prise avec un fiduciaire.
 *
 * Ce fichier n'est pas un conseil fiscal : il encode une règle publique et
 * laisse le choix à son utilisateur. La bascule et le numéro IDE doivent être
 * confirmés par votre comptable.
 */

/** Taux normal en vigueur depuis le 1er janvier 2024. */
export const TAUX_NORMAL = 0.081;

/** Seuil de chiffre d'affaires annuel au-delà duquel l'assujettissement est obligatoire. */
export const SEUIL_ASSUJETTISSEMENT_CHF = 100_000;

export type RegimeTva =
  | { assujetti: false }
  | {
      assujetti: true;
      /** Numéro IDE au format CHE-123.456.789 TVA. Obligatoire sur la facture. */
      numeroIde: string;
      taux?: number;
    };

/**
 * Les prix affichés (49, 89 CHF) sont-ils TTC ou HT ?
 *
 * `"ttc"` : le prix affiché ne bouge pas le jour de l'assujettissement ; la TVA
 * est extraite du montant. C'est le défaut, parce qu'il n'impose aucune hausse
 * aux clients déjà abonnés.
 *
 * `"ht"` : la TVA s'ajoute au prix affiché. Usage courant en B2B, où le client
 * la récupère — mais 49 CHF devient 52.97 CHF pour lui.
 */
export type BaseDePrix = "ttc" | "ht";

export interface Totaux {
  /** Montant hors taxe, en centimes. */
  htCentimes: number;
  /** Montant de TVA, en centimes. 0 si non assujetti. */
  tvaCentimes: number;
  /** Montant total réclamé au client, en centimes. */
  ttcCentimes: number;
  /** Taux appliqué, ou null si non assujetti. */
  taux: number | null;
}

const IDE = /^CHE-\d{3}\.\d{3}\.\d{3}(\sTVA)?$/;

/**
 * Calcule les montants d'une ligne de facture.
 *
 * Tout est en CENTIMES, jamais en francs flottants : additionner des `number`
 * décimaux fait dériver les totaux de quelques centimes, et une facture dont
 * le total ne tombe pas juste est une facture qu'un fiduciaire renvoie.
 *
 * L'arrondi suit la règle commerciale (0,5 vers le haut), appliqué une seule
 * fois sur la TVA — arrondir aussi le HT ferait que HT + TVA ne redonne pas
 * exactement le TTC encaissé par Stripe.
 */
export function calculerTotaux(
  montantAfficheCentimes: number,
  regime: RegimeTva,
  base: BaseDePrix = "ttc",
): Totaux {
  if (!Number.isInteger(montantAfficheCentimes) || montantAfficheCentimes < 0) {
    throw new Error(
      `Montant invalide : ${montantAfficheCentimes}. Les montants sont des entiers de centimes.`,
    );
  }

  if (!regime.assujetti) {
    // Aucune ligne de TVA : ni taux, ni montant, ni mention. C'est ce que la
    // loi impose à une entreprise non inscrite au registre.
    return {
      htCentimes: montantAfficheCentimes,
      tvaCentimes: 0,
      ttcCentimes: montantAfficheCentimes,
      taux: null,
    };
  }

  if (!IDE.test(regime.numeroIde.trim())) {
    throw new Error(
      `Numéro IDE invalide : « ${regime.numeroIde} ». Format attendu : CHE-123.456.789 TVA. ` +
        "Une facture assujettie sans IDE valable n'est pas conforme.",
    );
  }

  const taux = regime.taux ?? TAUX_NORMAL;

  if (base === "ht") {
    const tva = Math.round(montantAfficheCentimes * taux);
    return {
      htCentimes: montantAfficheCentimes,
      tvaCentimes: tva,
      ttcCentimes: montantAfficheCentimes + tva,
      taux,
    };
  }

  // TTC : la TVA est incluse et doit être extraite. ht = ttc / (1 + taux).
  const ht = Math.round(montantAfficheCentimes / (1 + taux));
  return {
    htCentimes: ht,
    // Par différence, et non par un second arrondi : c'est la seule façon de
    // garantir que HT + TVA redonne exactement le montant encaissé.
    tvaCentimes: montantAfficheCentimes - ht,
    ttcCentimes: montantAfficheCentimes,
    taux,
  };
}

/** Formate des centimes en montant suisse : 4900 -> « 49.00 ». */
export function formatCHF(centimes: number): string {
  const signe = centimes < 0 ? "-" : "";
  const abs = Math.abs(centimes);
  return `${signe}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** L'entreprise a-t-elle franchi le seuil et doit-elle s'annoncer ? */
export function doitSAssujettir(chiffreAffairesAnnuelCentimes: number): boolean {
  return chiffreAffairesAnnuelCentimes >= SEUIL_ASSUJETTISSEMENT_CHF * 100;
}
