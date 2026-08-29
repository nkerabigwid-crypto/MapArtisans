// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import type { RegimeTva } from "./vat";
import type { PartieFacture } from "./invoice";

/**
 * Identité fiscale de l'émetteur — source unique de vérité.
 *
 * TOUT VIENT DE L'ENVIRONNEMENT, RIEN DU CODE
 *
 * Deux raisons. D'abord la règle d'identité : le nom de la société éditrice
 * n'apparaît nulle part dans les sources (un test le vérifie). Ensuite le
 * bon sens comptable : une adresse légale, un IDE ou un statut d'assujetti
 * changent sans qu'on redéploie une application.
 *
 * RÉGIME TVA — ÉTAT AU 29 AOÛT 2026 : NON ASSUJETTI
 *
 * Confirmé par l'exploitant : chiffre d'affaires annuel inférieur au seuil
 * légal de 100 000 CHF. Aucune TVA ne doit donc figurer sur les factures.
 *
 * La bascule tient en UNE variable : renseigner `FACTURATION_IDE` avec le
 * numéro IDE délivré par l'AFC suffit à faire apparaître la TVA. Ne le faire
 * qu'après inscription effective au registre — mentionner un IDE qu'on n'a pas
 * encore, ou percevoir la TVA avant l'inscription, est une infraction.
 */

function requis(nom: string): string {
  const v = process.env[nom]?.trim();
  if (!v) {
    throw new Error(
      `${nom} absente. L'identité de l'émetteur d'une facture ne peut pas avoir ` +
        "de valeur par défaut : une facture au mauvais nom n'est pas rectifiable " +
        "une fois envoyée au client et à sa comptabilité.",
    );
  }
  return v;
}

/**
 * Régime TVA courant, déduit de la seule présence d'un IDE configuré.
 *
 * Volontairement pas de drapeau booléen séparé : un `TVA_ASSUJETTI=true` sans
 * IDE renseigné produirait une facture assujettie sans numéro, c'est-à-dire non
 * conforme. Lier les deux rend cet état impossible.
 */
export function regimeTvaCourant(): RegimeTva {
  const ide = process.env.FACTURATION_IDE?.trim();
  if (!ide) return { assujetti: false };
  return { assujetti: true, numeroIde: ide };
}

/** Coordonnées de l'émetteur, telles qu'elles doivent figurer sur la facture. */
export function emetteurCourant(): PartieFacture {
  return {
    raisonSociale: requis("FACTURATION_RAISON_SOCIALE"),
    // Une ligne par élément d'adresse, séparées par « | » dans la variable.
    adresse: requis("FACTURATION_ADRESSE")
      .split("|")
      .map((l) => l.trim())
      .filter(Boolean),
    email: process.env.FACTURATION_EMAIL?.trim() || undefined,
  };
}
