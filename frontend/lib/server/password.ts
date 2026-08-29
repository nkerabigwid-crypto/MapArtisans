// PAS de `import "server-only"` ici, volontairement : ce module est aussi
// importé par workers/reviewWorker.ts, qui tourne comme un processus Node
// autonome, hors du bundler de Next. Le paquet `server-only` lève de façon
// INCONDITIONNELLE dès qu'il est chargé ailleurs que sous le bundler de Next
// (c'est ce dernier, et lui seul, qui sait le neutraliser) — l'ajouter ici
// ferait planter le worker au démarrage. La frontière réelle est déjà tenue
// autrement : rien sous lib/server/ n'est importé par un composant "use
// client" (vérifié), et chaque route Next qui l'utilise déclare elle-même
// `export const runtime = "nodejs"`.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Hachage des mots de passe.
 *
 * · **scrypt**, pas SHA-256 ni bcrypt. scrypt est coûteux en mémoire autant
 *   qu'en calcul, ce qui neutralise l'avantage des attaquants disposant de GPU.
 *   Il est dans la bibliothèque standard de Node : aucune dépendance à auditer.
 *
 * · **Un sel aléatoire par mot de passe**, stocké avec le hachage. Sans sel,
 *   deux clients ayant le même mot de passe produisent le même hachage, et une
 *   table précalculée les casse tous les deux d'un coup.
 *
 * · **Comparaison à temps constant.** Un `===` sur des hachages fuit, par sa
 *   durée d'exécution, le nombre d'octets corrects — de quoi reconstruire la
 *   valeur octet par octet.
 *
 * · **Les paramètres sont stockés dans la chaîne.** Le jour où l'on durcit le
 *   coût, les anciens hachages restent vérifiables, et `needsRehash()` signale
 *   ceux à régénérer à la prochaine connexion réussie.
 *
 * Format : `scrypt$N$r$p$<sel base64>$<hachage base64>`
 */

const N = 16384; // coût CPU/mémoire — ~16 Mo par hachage
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("Le mot de passe doit faire au moins 12 caractères.");
  }
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  const actual = await scrypt(password.normalize("NFKC"), salt, expected.length);

  // Les deux tampons ont ici la même longueur par construction ; timingSafeEqual
  // lève si ce n'est pas le cas, d'où la garde.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Signale un hachage produit avec des paramètres devenus trop faibles. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < N || Number(parts[2]) < R || Number(parts[3]) < P;
}
