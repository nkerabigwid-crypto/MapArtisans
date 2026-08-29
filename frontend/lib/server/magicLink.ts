// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.

/**
 * Liens magiques — connexion sans mot de passe.
 *
 * Cible : un plombier qui achète son abonnement depuis son téléphone, entre
 * deux interventions. Lui imposer d'inventer un mot de passe sur un clavier de
 * smartphone coûte des conversions ; le lien magique supprime cette étape.
 *
 * QUATRE DÉCISIONS DE SÉCURITÉ, ET LEURS RAISONS
 *
 * 1. **Seul le HACHÉ du jeton est stocké.** Un lien magique est un identifiant
 *    de connexion complet : il ouvre la session sans rien demander d'autre.
 *    Stocké en clair, une fuite de la base — ou une simple sauvegarde qui
 *    traîne — donnerait un accès direct à tous les comptes dont le lien n'a pas
 *    encore expiré. Le serveur n'a jamais besoin de relire le jeton, seulement
 *    de reconnaître celui qu'on lui présente : le haché suffit.
 *
 * 2. **Usage unique, consommé de façon ATOMIQUE.** Vérifier puis marquer en
 *    deux temps laisse une fenêtre où deux requêtes simultanées passent toutes
 *    les deux — cas réel, pas théorique : les clients mail et les
 *    prévisualiseurs de lien (Gmail, WhatsApp, Outlook) suivent les URL avant
 *    l'utilisateur. D'où `consumeMagicLink()` côté dépôt, qui teste et marque
 *    en une seule opération.
 *
 * 3. **15 minutes de validité.** Assez pour ouvrir un e-mail reçu pendant un
 *    chantier, assez peu pour qu'un lien oublié dans une boîte de réception
 *    partagée cesse vite d'être exploitable.
 *
 * 4. **Le jeton n'est jamais journalisé ni renvoyé.** `createMagicLink()` le
 *    rend une seule fois à l'appelant, qui l'envoie et l'oublie.
 *
 * CE QUE CE MODULE NE FAIT PAS, VOLONTAIREMENT
 *
 * Il n'envoie pas le lien par SMS. Un numéro saisi à la volée sur un formulaire
 * de paiement n'est vérifié par personne : un chiffre de travers, et le lien de
 * connexion — donc le compte, avec les données de l'entreprise — part chez un
 * inconnu. L'e-mail, lui, est celui du paiement : il est déjà corroboré par
 * Stripe. Le SMS de bienvenue reste utile, mais SANS jeton dedans.
 */

const TTL_MS = 15 * 60 * 1000;

export interface MagicLinkRecord {
  /** SHA-256 du jeton, en hexadécimal. Jamais le jeton lui-même. */
  tokenHash: string;
  userId: string;
  /** Epoch millisecondes. */
  expiresAt: number;
  /** Epoch millisecondes du jour où il a été consommé ; null tant qu'il est neuf. */
  usedAt: number | null;
}

/**
 * Hache un jeton pour comparaison ou stockage.
 *
 * SHA-256 nu, sans sel ni facteur de coût — contrairement aux mots de passe.
 * C'est délibéré : un jeton fait 32 octets tirés au hasard, il n'a ni entropie
 * faible ni réutilisation possible ailleurs. Les défenses contre les attaques
 * par dictionnaire n'ont rien à protéger ici, et un scrypt à chaque clic
 * ajouterait une latence gratuite sur le chemin de connexion.
 */
export async function hashMagicToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fabrique un lien magique pour un utilisateur.
 *
 * Renvoie le jeton EN CLAIR (à envoyer, puis à oublier) et l'enregistrement à
 * persister, qui ne contient que le haché.
 */
export async function createMagicLink(
  userId: string,
  now: number = Date.now(),
): Promise<{ token: string; record: MagicLinkRecord }> {
  // 32 octets : même ordre de grandeur qu'une clé de session. En deçà, un
  // jeton devient devinable par force brute sur une fenêtre de 15 minutes.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const token = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return {
    token,
    record: {
      tokenHash: await hashMagicToken(token),
      userId,
      expiresAt: now + TTL_MS,
      usedAt: null,
    },
  };
}

/**
 * Construit l'URL à envoyer.
 *
 * Le jeton passe en segment de chemin, pas en paramètre de requête : une URL
 * avec `?token=…` se retrouve dans l'en-tête `Referer` envoyé à chaque
 * ressource tierce chargée par la page d'arrivée, et dans les journaux de tout
 * intermédiaire. Le chemin fuit moins, et la page de destination doit de toute
 * façon consommer le jeton immédiatement puis rediriger.
 */
export function magicLinkUrl(baseUrl: string, token: string): string {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error(
      `Lien magique refusé sur ${base.protocol}//${base.hostname} : un jeton de ` +
        "connexion ne doit jamais transiter en clair.",
    );
  }
  return new URL(`/connexion/lien/${encodeURIComponent(token)}`, base).toString();
}

/** Motifs d'échec — distingués pour le message affiché, jamais pour l'appelant anonyme. */
export type MagicLinkFailure = "inconnu" | "expire" | "deja-utilise";

export function evaluerLien(
  record: MagicLinkRecord | null,
  now: number = Date.now(),
): { ok: true; userId: string } | { ok: false; raison: MagicLinkFailure } {
  if (!record) return { ok: false, raison: "inconnu" };
  if (record.usedAt !== null) return { ok: false, raison: "deja-utilise" };
  if (record.expiresAt <= now) return { ok: false, raison: "expire" };
  return { ok: true, userId: record.userId };
}
