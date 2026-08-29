// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { measureSms } from "./gsm7";

/**
 * SMS de bienvenue, envoyé juste après le paiement.
 *
 * IL NE CONTIENT PAS LE LIEN DE CONNEXION, et c'est délibéré.
 *
 * Le numéro de portable est saisi à la volée sur un formulaire de paiement et
 * personne ne l'a vérifié. Un chiffre de travers et le lien magique — qui ouvre
 * le compte sans rien demander d'autre — arrive chez un inconnu qui n'a qu'à
 * cliquer. L'adresse e-mail, elle, est celle du paiement : Stripe l'a déjà
 * corroborée en encaissant la carte.
 *
 * Le SMS sert donc à une seule chose : prévenir l'artisan qu'un e-mail vient de
 * partir, pour qu'il le cherche au lieu de croire que rien ne s'est passé. Le
 * canal reste utile — un artisan lit ses SMS, pas toujours ses e-mails — mais il
 * ne transporte aucun secret.
 *
 * Contraintes de coût identiques au rapport hebdomadaire : un seul segment, et
 * aucun caractère hors GSM-7 (« pret » sans accent circonflexe est un choix de
 * facturation, pas une faute — voir weeklyReport.ts).
 */

export interface WelcomeSmsData {
  /** Marque affichée. `null` pour un client direct ; le nom de l'agence sinon. */
  brandName?: string | null;
}

const MARQUE_MAX = 40;

function marqueTronquee(nom: string): string {
  const propre = nom.trim();
  if (propre.length <= MARQUE_MAX) return propre;
  const coupe = propre.slice(0, MARQUE_MAX);
  const espace = coupe.lastIndexOf(" ");
  return (espace > MARQUE_MAX / 2 ? coupe.slice(0, espace) : coupe).trimEnd();
}

export function composeWelcomeSms(data: WelcomeSmsData = {}): string {
  const marque = data.brandName?.trim() ? marqueTronquee(data.brandName) : "MapArtisans";
  return (
    `${marque} : votre compte est pret. ` +
    "Le lien de connexion vient de partir par e-mail. " +
    "Pensez aux indesirables."
  );
}

/** Vérifie qu'un SMS de bienvenue tient en un segment GSM-7. */
export function welcomeFitsOneSegment(body: string): boolean {
  const cost = measureSms(body);
  return cost.segments === 1 && cost.encoding === "GSM-7";
}
