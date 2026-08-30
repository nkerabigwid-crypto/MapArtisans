// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.

/**
 * Contrôle d'accès de l'assistant conversationnel.
 *
 * POURQUOI CE FICHIER EXISTE AVANT MÊME LE SERVICE DE CONVERSATION
 *
 * Le widget tourne sur le site de l'artisan. Sa clé est écrite en clair dans
 * le code source de la page — c'est inévitable, un navigateur ne sait pas
 * garder de secret. Quiconque affiche la page peut donc copier la clé et
 * appeler notre API autant qu'il veut.
 *
 * Chaque appel coûte un jeton OpenAI. Sans plafond ni filtre d'origine, un
 * seul plaisantin avec une boucle `curl` épuise le budget d'un artisan en
 * quelques minutes — et le nôtre avec.
 *
 * Trois barrières, dans cet ordre de coût croissant :
 *   1. l'origine, vérifiée sans aucun accès réseau ni base ;
 *   2. la longueur du message, qui borne le coût d'un appel isolé ;
 *   3. le quota quotidien, qui borne le total.
 */

export interface AssistantSettings {
  googleProfileId: string;
  widgetKey: string;
  /** Domaines autorisés. Vide = aucun appel accepté. */
  allowedOrigins: string[];
  faqContext: string | null;
  widgetColor: string;
  dailyMessageLimit: number;
  isActive: boolean;
}

export type RefusAssistant =
  | "cle-inconnue"
  | "assistant-desactive"
  | "origine-refusee"
  | "message-vide"
  | "message-trop-long"
  | "quota-atteint";

/**
 * Longueur maximale d'un message entrant.
 *
 * 1 000 caractères couvrent très largement une question d'artisanat (« ma
 * chaudière fait un bruit depuis hier, pouvez-vous passer jeudi ? »). Au-delà,
 * il ne s'agit plus d'un client : soit d'un texte collé pour gonfler la
 * facture, soit d'une tentative d'injecter des consignes dans le prompt.
 */
export const LONGUEUR_MAX_MESSAGE = 1000;

/**
 * Normalise une origine HTTP en nom d'hôte comparable.
 *
 * L'en-tête `Origin` vaut « https://exemple.ch » ou « https://exemple.ch:443 ».
 * On compare des noms d'hôtes, pas des URL : sans cela, le même site déclaré
 * avec ou sans « https:// » ne correspondrait pas.
 */
export function normaliserOrigine(origine: string | null | undefined): string | null {
  if (!origine) return null;
  const brut = origine.trim().toLowerCase();
  if (!brut) return null;
  try {
    // Accepte aussi bien « exemple.ch » qu'une URL complète.
    const url = brut.includes("://") ? new URL(brut) : new URL(`https://${brut}`);
    const hote = url.hostname.replace(/\.$/, "");
    return /^[a-z0-9.-]+$/.test(hote) && hote.length <= 253 ? hote : null;
  } catch {
    return null;
  }
}

/** Découpe la liste stockée en base. Tolère les espaces et les entrées vides. */
export function parseOrigines(brut: string): string[] {
  return brut
    .split(",")
    .map((o) => normaliserOrigine(o))
    .filter((o): o is string => o !== null);
}

/**
 * L'origine est-elle autorisée ?
 *
 * Le sous-domaine `www` est accepté d'office quand le domaine nu est déclaré :
 * un artisan qui inscrit « dupont-plomberie.ch » ne comprendrait pas que son
 * site répond sur « www.dupont-plomberie.ch » et que le widget y reste muet.
 * L'inverse n'est PAS vrai — déclarer un sous-domaine n'ouvre pas le domaine.
 */
export function origineAutorisee(origine: string | null, autorisees: string[]): boolean {
  if (!origine || autorisees.length === 0) return false;
  return autorisees.some((a) => origine === a || origine === `www.${a}`);
}

export interface DemandeAssistant {
  message: string;
  origine: string | null;
  /** Messages déjà consommés aujourd'hui par cette fiche. */
  messagesAujourdhui: number;
}

/**
 * Décide si une requête du widget peut être servie.
 *
 * Fonction PURE : aucun accès réseau, aucune base. Elle est appelée avant tout
 * appel à OpenAI, et c'est précisément ce qui la rend utile — refuser doit
 * coûter moins cher qu'accepter.
 */
export function autoriserDemande(
  reglages: AssistantSettings | null,
  demande: DemandeAssistant,
): { ok: true } | { ok: false; raison: RefusAssistant } {
  if (!reglages) return { ok: false, raison: "cle-inconnue" };
  if (!reglages.isActive) return { ok: false, raison: "assistant-desactive" };

  if (!origineAutorisee(normaliserOrigine(demande.origine), reglages.allowedOrigins)) {
    return { ok: false, raison: "origine-refusee" };
  }

  const message = demande.message.trim();
  if (!message) return { ok: false, raison: "message-vide" };
  if (message.length > LONGUEUR_MAX_MESSAGE) {
    return { ok: false, raison: "message-trop-long" };
  }

  if (demande.messagesAujourdhui >= reglages.dailyMessageLimit) {
    return { ok: false, raison: "quota-atteint" };
  }

  return { ok: true };
}

/**
 * Message rendu au visiteur en cas de refus.
 *
 * Aucun ne révèle pourquoi. Dire « origine refusée » indiquerait à un
 * attaquant qu'il lui suffit de falsifier l'en-tête ; dire « quota atteint »
 * lui confirmerait qu'il a réussi à l'épuiser. Le visiteur légitime, lui, n'a
 * que faire de la raison : ce qu'il veut, c'est joindre l'artisan.
 */
export function messageDeRefus(raison: RefusAssistant): string {
  if (raison === "message-trop-long") {
    return "Votre message est un peu long. Pouvez-vous le résumer en quelques phrases ?";
  }
  return "L'assistant n'est pas disponible pour le moment. Contactez directement l'entreprise.";
}

/** Génère une clé de widget. 32 octets, format URL-compatible. */
export function genererWidgetKey(): string {
  const octets = crypto.getRandomValues(new Uint8Array(24));
  let bin = "";
  for (const o of octets) bin += String.fromCharCode(o);
  return "wk_" + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
