// PAS de `import "server-only"` ici, volontairement : ce module est aussi
// importé par workers/reviewWorker.ts, qui tourne comme un processus Node
// autonome, hors du bundler de Next. Le paquet `server-only` lève de façon
// INCONDITIONNELLE dès qu'il est chargé ailleurs que sous le bundler de Next
// (c'est ce dernier, et lui seul, qui sait le neutraliser) — l'ajouter ici
// ferait planter le worker au démarrage. La frontière réelle est déjà tenue
// autrement : rien sous lib/server/ n'est importé par un composant "use
// client" (vérifié), et chaque route Next qui l'utilise déclare elle-même
// `export const runtime = "nodejs"`.
/**
 * Chiffrement des jetons Google au repos.
 *
 * Exigence du schéma (db/schema-v1.4.sql) : `google_access_token` et
 * `google_refresh_token` ne doivent jamais être écrits en clair. Une fuite de
 * la base donnerait sinon le contrôle des fiches Google de tous les clients.
 *
 * Choix techniques, et pourquoi :
 *
 * · **AES-256-GCM**, pas CBC. GCM est authentifié : un texte chiffré modifié
 *   est rejeté au déchiffrement. Du CBC sans MAC séparé est la faille
 *   classique du chiffrement maison.
 *
 * · **Un IV aléatoire par opération**, jamais réutilisé. Réutiliser un IV en
 *   GCM avec la même clé casse la confidentialité ET l'authentification.
 *
 * · **Web Crypto** plutôt que `node:crypto` : la même implémentation
 *   fonctionne dans le runtime Node et dans l'Edge, ce qui évite d'avoir deux
 *   versions du même code selon l'endroit où il s'exécute.
 *
 * · **Un préfixe de version** dans la charge utile. Le jour où la clé doit
 *   tourner, on saura quoi déchiffrer avec quelle clé — sans ce marqueur, une
 *   rotation oblige à tout réécrire d'un coup.
 *
 * Format produit : `v1.<iv base64url>.<chiffré+tag base64url>`
 */

const VERSION = "v1";
const IV_BYTES = 12; // 96 bits — la taille recommandée pour GCM

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  // Construit sur un ArrayBuffer explicite : Web Crypto attend un BufferSource
  // adossé à un ArrayBuffer, et non au ArrayBufferLike générique que renvoie
  // Uint8Array.from — la distinction est apparue avec TypeScript 5.7.
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedKey: CryptoKey | null = null;

/**
 * Charge la clé depuis l'environnement.
 *
 * Échoue bruyamment et au premier appel plutôt que de se rabattre sur une clé
 * par défaut : un secret de repli est la manière la plus sûre d'expédier en
 * production un chiffrement qui ne protège rien.
 */
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY absente. Générez-en une avec :\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY doit faire 32 octets une fois décodée (AES-256), ` +
        `elle en fait ${keyBytes.length}.`,
    );
  }

  cachedKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return cachedKey;
}

/** Chiffre un jeton avant écriture en base. */
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${VERSION}.${b64urlEncode(iv)}.${b64urlEncode(new Uint8Array(encrypted))}`;
}

/**
 * Déchiffre un jeton lu en base.
 *
 * Lève sur charge malformée, version inconnue ou tag invalide. On ne renvoie
 * jamais `null` en silence : un jeton illisible est un incident, pas un cas
 * nominal à ignorer.
 */
export async function decryptToken(payload: string): Promise<string> {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Jeton chiffré malformé.");

  const [version, ivPart, dataPart] = parts;
  if (version !== VERSION) throw new Error(`Version de chiffrement inconnue : ${version}`);

  const key = await getKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64urlDecode(ivPart) },
    key,
    b64urlDecode(dataPart),
  );
  return new TextDecoder().decode(decrypted);
}

/** Réinitialise le cache de clé — réservé aux tests. */
export function __resetKeyCache() {
  cachedKey = null;
}
