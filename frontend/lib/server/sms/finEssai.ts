// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { measureSms } from "./gsm7";

/**
 * SMS de rappel, la veille de la fin d'essai.
 *
 * ON N'Y POSE PAS DE QUESTION, ET C'EST DÉLIBÉRÉ
 *
 * « Êtes-vous content du service ? » appelle une réponse. Or aucun traitement
 * des SMS entrants n'existe : l'artisan répondrait dans le vide, et un message
 * resté sans réponse fait plus de mal que pas de message du tout — surtout
 * envoyé la veille d'une décision d'achat.
 *
 * Le message dit donc ce qui se passe, ce qui est conservé, et où agir. La
 * conversation, elle, est possible par e-mail, où quelqu'un lit vraiment.
 *
 * UN SEUL SEGMENT
 *
 * 160 caractères en GSM-7. Le nom de l'artisan est tronqué avant d'en sortir :
 * un rappel facturé en trois segments à chaque essai, c'est le coût de la
 * conversion multiplié par trois.
 */

/** Adresse courte de la page des formules. */
const LIEN = "mapartisans.com/abonnement";

/**
 * Longueur maximale du nom affiché.
 *
 * Le reste du message fait 118 caractères, lien compris. Il reste donc 42
 * caractères — on s'arrête à 32 pour garder une marge si le texte évolue.
 */
const NOM_MAX = 32;

export function nomTronque(nom: string, max = NOM_MAX): string {
  const propre = nom.trim();
  if (propre.length <= max) return propre;
  // Coupe sur un espace pour ne pas laisser un mot à moitié.
  const coupe = propre.slice(0, max);
  const espace = coupe.lastIndexOf(" ");
  return (espace > max / 2 ? coupe.slice(0, espace) : coupe).trimEnd();
}

export interface RappelEssaiData {
  businessName: string;
}

export function composeRappelEssai(data: RappelEssaiData): string {
  const nom = nomTronque(data.businessName);
  // « demain » plutôt qu'une date : lisible sans calcul, et deux caractères
  // au lieu de dix.
  return `${nom} : votre essai MapArtisans se termine demain. Vos avis et reglages sont gardes. Continuer : ${LIEN}`;
}

/** Garde-fou de coût, comme pour les autres SMS du produit. */
export function rappelFitsOneSegment(body: string): boolean {
  const cout = measureSms(body);
  return cout.segments === 1 && cout.encoding === "GSM-7";
}
