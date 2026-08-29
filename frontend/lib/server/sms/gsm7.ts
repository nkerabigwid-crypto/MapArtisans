// PAS de `import "server-only"` : ce module est importé par workers/, hors du
// bundler de Next. Voir la note en tête de lib/server/crypto.ts.

/**
 * Encodage et découpage des SMS (norme GSM 03.38).
 *
 * Pourquoi ce module existe : Twilio facture **au segment**, pas au message.
 * Un SMS entièrement représentable en GSM-7 tient 160 caractères par segment ;
 * dès qu'un seul caractère sort de cette table, le message entier bascule en
 * UCS-2 et tombe à **70 caractères par segment**. Un rapport de 150 caractères
 * passe donc de 1 à 3 segments — le triple du prix — à cause d'une seule
 * lettre.
 *
 * En français, le piège est permanent : « è », « é », « à » figurent dans la
 * table GSM-7, mais « ê », « û », « î », « ô » et le « ç » minuscule n'y sont
 * pas. Écrire « vous êtes 3e » plutôt que « vous voilà 3e » suffit à tripler
 * la facture SMS de tout le parc.
 */

/**
 * Table de base GSM 03.38. Chaque caractère compte pour une unité.
 * Reproduite explicitement plutôt que devinée : c'est elle qui décide du prix.
 * Les sauts de ligne et retours chariot en font partie, d'où les échappements.
 */
const GSM7_BASE =
  "@£$¥èéùìòÇ\nØø\rÅå" +
  "Δ_ΦΓΛΩΠΨΣΘΞ" +
  "ÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";

/**
 * Table d'extension : ces caractères existent en GSM-7 mais coûtent deux
 * unités chacun, un caractère d'échappement les précédant.
 */
const GSM7_EXTENDED = "^{}\\[~]|€";

const BASE = new Set(GSM7_BASE);
const EXTENDED = new Set(GSM7_EXTENDED);

/** Un texte est-il entièrement représentable en GSM-7 ? */
export function isGsm7(text: string): boolean {
  for (const c of text) {
    if (!BASE.has(c) && !EXTENDED.has(c)) return false;
  }
  return true;
}

/** Caractères qui forceraient le passage en UCS-2, sans doublon. */
export function nonGsm7Chars(text: string): string[] {
  const found = new Set<string>();
  for (const c of text) {
    if (!BASE.has(c) && !EXTENDED.has(c)) found.add(c);
  }
  return [...found];
}

export interface SmsCost {
  encoding: "GSM-7" | "UCS-2";
  /** Unités facturées — un caractère étendu en vaut deux. */
  units: number;
  segments: number;
  /** Caractères responsables d'un basculement en UCS-2, s'il y en a. */
  offenders: string[];
}

/**
 * Calcule l'encodage, le nombre d'unités et de segments d'un message.
 *
 * Les seuils viennent de la norme : en GSM-7, 160 pour un segment unique et
 * 153 par segment dès qu'il y en a plusieurs — sept unités partent dans
 * l'en-tête de concaténation. En UCS-2, 70 et 67 pour la même raison.
 */
export function measureSms(text: string): SmsCost {
  const offenders = nonGsm7Chars(text);

  if (offenders.length === 0) {
    let units = 0;
    for (const c of text) units += EXTENDED.has(c) ? 2 : 1;
    const segments = units <= 160 ? 1 : Math.ceil(units / 153);
    return { encoding: "GSM-7", units, segments, offenders: [] };
  }

  // En UCS-2, un caractère hors du plan multilingue de base (un émoji, par
  // exemple) occupe deux unités — d'où le comptage sur les unités UTF-16
  // via `.length`, et non sur les points de code.
  const units = text.length;
  const segments = units <= 70 ? 1 : Math.ceil(units / 67);
  return { encoding: "UCS-2", units, segments, offenders };
}
