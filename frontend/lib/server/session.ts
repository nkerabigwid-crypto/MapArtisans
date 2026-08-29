/**
 * Sessions signées.
 *
 * Volontairement SANS `server-only` : le middleware doit pouvoir vérifier une
 * session dans le runtime Edge, où `node:crypto` n'existe pas. Tout passe donc
 * par Web Crypto, disponible dans les deux runtimes.
 *
 * · **Signature HMAC-SHA256**, pas de chiffrement. Le contenu de la session
 *   (identifiant utilisateur, expiration) n'est pas secret — ce qui compte est
 *   qu'il soit infalsifiable.
 *
 * · **Vérification à temps constant**, comme pour les mots de passe.
 *
 * · **Expiration dans la charge signée**, pas seulement dans le cookie. Un
 *   cookie voit sa date d'expiration fixée par le client : s'y fier permettrait
 *   de rejouer indéfiniment une session périmée.
 *
 * · **Le cookie est `httpOnly`, `sameSite=lax` et `secure` hors développement.**
 *   httpOnly met la session hors de portée d'un script injecté ; sameSite=lax
 *   bloque l'essentiel des requêtes intersites tout en laissant fonctionner les
 *   retours de redirection OAuth.
 */

const COOKIE_NAME = "ma_session";
const TTL_SECONDS = 60 * 60 * 24 * 14; // 14 jours

export interface SessionPayload {
  /** Identifiant de l'utilisateur. */
  uid: string;
  /** Expiration, en secondes epoch. */
  exp: number;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  // Voir la note dans crypto.ts : Web Crypto exige un ArrayBuffer, pas le
  // ArrayBufferLike générique.
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET absente ou trop courte (32 caractères minimum). Générez-en une avec :\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  cachedKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

/** Fabrique un jeton de session signé. */
export async function createSession(uid: string): Promise<string> {
  const payload: SessionPayload = {
    uid,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/**
 * Vérifie un jeton et renvoie sa charge, ou `null`.
 *
 * Renvoie `null` pour tout échec — signature invalide, session expirée, format
 * illisible — sans distinguer les cas : dire à un attaquant *pourquoi* son
 * jeton est refusé lui donne une prise.
 */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  try {
    const key = await getKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      unb64url(sig),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(unb64url(body))) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: COOKIE_NAME,
  /** Options d'écriture du cookie de session. */
  options(maxAge = TTL_SECONDS) {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    };
  },
  /** Options de suppression — même chemin, durée nulle. */
  clearOptions() {
    return { ...this.options(0), maxAge: 0 };
  },
};

export function __resetSessionKeyCache() {
  cachedKey = null;
}
