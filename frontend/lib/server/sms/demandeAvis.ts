// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { measureSms } from "./gsm7";
import { reviewUrl } from "@/lib/server/qr";

/**
 * Demande d'avis envoyée par SMS après une intervention.
 *
 * C'EST LE LEVIER LE PLUS DIRECT SUR LE NOMBRE D'AVIS
 *
 * Le QR code est passif : il faut que l'artisan y pense, sur le moment, alors
 * qu'il range ses outils. Le SMS part tout seul. La différence se compte en
 * avis par semaine plutôt que par trimestre.
 *
 * LA RÈGLE QUI GOUVERNE TOUT LE MODULE
 *
 * L'envoi va à TOUS les clients, sans exception et sans condition. Google
 * interdit de « solliciter sélectivement les avis positifs » : proposer à
 * l'artisan de choisir qui reçoit le SMS transformerait cet outil en la chose
 * même que nous refusons de construire depuis le début.
 *
 * Il n'y a donc, volontairement, aucun paramètre permettant de filtrer.
 */

export interface DemandeAvisData {
  /** place_id de la fiche : c'est lui qui construit le lien d'avis. */
  placeId: string;
  businessName: string;
  /** Marque affichée. `null` pour un client direct. */
  brandName?: string | null;
}

/**
 * Budget de caractères pour le nom de l'entreprise.
 *
 * Mesuré : le lien Google fait 79 caractères, et le texte fixe environ 44.
 * Sur les 160 disponibles en GSM-7, il reste 37 pour le nom. Au-delà, le SMS
 * passe à deux segments — et sur un parc d'artisans qui envoient après chaque
 * intervention, cela double la ligne SMS du compte d'exploitation.
 */
const NOM_MAX = 34;

/**
 * Page de désabonnement.
 *
 * POURQUOI UN LIEN ET PAS « RÉPONDEZ STOP »
 *
 * Les SMS partent d'un expéditeur alphanumérique — « MapArtisans » et non un
 * numéro. Android l'affiche lui-même au destinataire : « l'expéditeur ne peut
 * pas accepter de réponses ». Un « répondez STOP » serait donc une consigne
 * impossible à suivre, ce qui est pire que rien.
 */
const LIEN_DESABONNEMENT = "mapartisans.com/stop";

function nomTronque(nom: string): string {
  const propre = nom.trim();
  if (propre.length <= NOM_MAX) return propre;
  const coupe = propre.slice(0, NOM_MAX);
  const espace = coupe.lastIndexOf(" ");
  return (espace > NOM_MAX / 2 ? coupe.slice(0, espace) : coupe).trimEnd();
}

/**
 * Compose le message.
 *
 * Sans accent circonflexe ni cédille : un seul caractère hors GSM-7 ferait
 * basculer le message en UCS-2, où la limite tombe à 70 caractères — le lien
 * seul en fait 79. Le SMS partirait alors systématiquement en trois segments.
 */
export function composeDemandeAvis(data: DemandeAvisData): string {
  const nom = nomTronque(data.brandName?.trim() || data.businessName);
  // « merci » plutôt qu'une formule longue : chaque caractère économisé
  // éloigne du basculement à deux segments.
  return (
    `${nom} vous remercie. Votre avis en 10 secondes : ${reviewUrl(data.placeId)}` +
    `\nNe plus recevoir : ${LIEN_DESABONNEMENT}`
  );
}

/** Vérifie qu'une demande tient en un segment GSM-7. */
/**
 * Budget de la demande d'avis : DEUX segments, délibérément.
 *
 * Le lien Google fait 79 caractères à lui seul ; avec le nom de l'entreprise
 * et le texte, on atteignait déjà 157 sur 160. Le lien de désabonnement ne
 * pouvait donc pas tenir dans un segment.
 *
 * Trois voies existaient. Raccourcir le lien Google par une redirection maison
 * aurait libéré la place, mais affaibli la garantie — vérifiée par un test —
 * que le lien pointe DIRECTEMENT vers Google, sans page intermédiaire : c'est
 * elle qui prouve qu'aucun tri de clients n'a lieu, et elle compte dans le
 * dossier d'accès à l'API. Ne rien mettre laissait le produit sans trace de
 * consentement.
 *
 * Reste le second segment. Il double le coût de CE message — au plafond du
 * palier d'entrée, la facture SMS reste à 16 % du prix de l'abonnement. Le
 * calcul n'est pas serré.
 */
export const SEGMENTS_MAX_DEMANDE = 2;

export function demandeFitsBudget(corps: string): boolean {
  const cout = measureSms(corps);
  return cout.segments <= SEGMENTS_MAX_DEMANDE && cout.encoding === "GSM-7";
}

export type RefusDemande =
  | "numero-invalide"
  | "desabonne"
  | "deja-sollicite"
  | "fiche-sans-place-id";

/**
 * Délai avant de pouvoir redemander au même client.
 *
 * Quatre-vingt-dix jours. Un artisan qui intervient trois fois chez la même
 * personne dans le mois ne doit pas envoyer trois SMS : c'est agaçant, et la
 * sollicitation répétée est vue comme une pratique douteuse par Google.
 */
export const DELAI_RELANCE_JOURS = 90;

export interface ContexteEnvoi {
  clientPhone: string;
  placeId: string | null;
  /** Le numéro figure-t-il au registre de désabonnement ? */
  desabonne: boolean;
  /** Date du dernier envoi à ce numéro pour cette fiche, s'il y en a eu un. */
  dernierEnvoi: Date | null;
}

/**
 * Décide si une demande peut partir.
 *
 * Fonction PURE, appelée avant tout appel à Twilio : refuser doit coûter moins
 * cher qu'envoyer. Aucun de ces refus ne dépend de ce que le client pense du
 * service — seulement de son numéro et de la date du dernier contact.
 */
export function autoriserDemande(
  ctx: ContexteEnvoi,
  maintenant: Date = new Date(),
): { ok: true } | { ok: false; raison: RefusDemande } {
  if (!ctx.placeId) return { ok: false, raison: "fiche-sans-place-id" };

  const numero = ctx.clientPhone.replace(/[\s.\-()]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(numero)) {
    return { ok: false, raison: "numero-invalide" };
  }

  // Le désabonnement passe avant tout le reste : un client qui a dit STOP ne
  // doit pas voir son numéro comparé à des dates avant d'être écarté.
  if (ctx.desabonne) return { ok: false, raison: "desabonne" };

  if (ctx.dernierEnvoi) {
    const ecoule = maintenant.getTime() - ctx.dernierEnvoi.getTime();
    if (ecoule < DELAI_RELANCE_JOURS * 24 * 3600 * 1000) {
      return { ok: false, raison: "deja-sollicite" };
    }
  }

  return { ok: true };
}

/**
 * Un message entrant est-il une demande de désabonnement ?
 *
 * Les opérateurs suisses ne gèrent pas STOP automatiquement comme aux
 * États-Unis : c'est à nous de le faire. Les variantes couvrent ce qu'écrit
 * réellement quelqu'un d'agacé, pas seulement le mot-clé officiel.
 */
export function estDesabonnement(message: string): boolean {
  const propre = message.trim().toLowerCase().replace(/[.!]/g, "");
  return ["stop", "stopp", "arret", "arreter", "desabonnement", "unsubscribe", "no", "non"].includes(
    propre,
  );
}
