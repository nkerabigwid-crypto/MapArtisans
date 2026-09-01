// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { measureSms } from "./gsm7";

/**
 * SMS de rappel, la veille de la fin d'essai.
 *
 * IL NE PORTE PAS LE NOM DE L'ARTISAN, CONTRAIREMENT AUX AUTRES SMS
 *
 * La demande d'avis et le rapport hebdomadaire commencent par le nom de
 * l'entreprise, parce qu'ils s'adressent à ses CLIENTS, qui doivent
 * reconnaître l'expéditeur. Celui-ci s'adresse à l'artisan lui-même : il sait
 * qui il est, et ce qu'il doit savoir, c'est qui lui écrit.
 *
 * La première version le préfixait quand même, ce qui donnait « MapArtisans :
 * votre essai MapArtisans se termine demain ». Supprimer le nom règle la
 * répétition, économise une trentaine de caractères, et rend inutile toute
 * logique de troncature.
 *
 * ON N'Y POSE AUCUNE QUESTION
 *
 * « Êtes-vous content du service ? » appelle une réponse, et aucun traitement
 * des SMS entrants n'existe : l'artisan répondrait dans le vide. Un message
 * resté sans réponse la veille d'une décision d'achat fait plus de mal que pas
 * de message du tout.
 */

/**
 * Le message, en clair et sans variable.
 *
 * Aucune interpolation : rien ne peut donc l'allonger au-delà de la mesure
 * faite ici, et un test vérifie qu'il tient en un segment. Les accents sont
 * conservés — é et è appartiennent au jeu GSM-7, ils ne coûtent rien.
 */
export const MESSAGE_RAPPEL_ESSAI =
  "MapArtisans : votre essai se termine demain. " +
  "Vos avis et réglages sont gardés. " +
  "Continuer : mapartisans.com/abonnement";

export function composeRappelEssai(): string {
  return MESSAGE_RAPPEL_ESSAI;
}

/** Garde-fou de coût, comme pour les autres SMS du produit. */
export function rappelFitsOneSegment(body: string): boolean {
  const cout = measureSms(body);
  return cout.segments === 1 && cout.encoding === "GSM-7";
}
