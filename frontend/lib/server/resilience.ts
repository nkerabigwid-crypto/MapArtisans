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
 * Rejeu à délai exponentiel pour les appels externes.
 *
 * L'API Google Business Profile et l'API OpenAI imposent des quotas stricts.
 * Sans cette enveloppe, une seule réponse 429 (quota dépassé) ou 503 (service
 * indisponible) ferait échouer une réponse à un avis que l'IA avait pourtant
 * correctement rédigée — l'artisan verrait un avis rester bloqué en attente
 * pour une raison qui n'a rien à voir avec le contenu.
 *
 * Choix de conception :
 *
 * · **Seules les erreurs transitoires sont rejouées** (429, 502, 503, 504, et
 *   les erreurs réseau). Une 400 ou une 401 ne changera pas de résultat au
 *   rejeu — insister dessus ne fait que retarder l'échec et gaspiller le quota.
 *
 * · **Le rejeu respecte `Retry-After`** quand l'API le fournit. Google et
 *   OpenAI l'envoient sur 429 : l'ignorer et retenter à son propre rythme
 *   revient à narguer un serveur qui vient de demander de ralentir.
 *
 * · **Gigue aléatoire** ajoutée au délai calculé. Sans elle, un incident qui
 *   fait échouer plusieurs appels au même instant les fait tous retenter au
 *   même instant — c'est ainsi qu'un pic de charge en engendre un second.
 *
 * · **Nombre de tentatives borné**, jamais infini. Un rejeu illimité sur une
 *   panne prolongée transforme une file de tâches en fuite de mémoire.
 */

export class RetryableError extends Error {
  readonly status?: number;
  readonly retryAfterMs?: number;

  // Champs assignés dans le corps du constructeur, pas en paramètres
  // raccourcis (`public readonly status?`) : le mode natif de Node
  // (`--experimental-strip-types`, utilisé par les workers et les tests de ce
  // projet) ne fait que retirer les annotations de type sans transformer le
  // code — les « parameter properties » exigent une vraie transformation et y
  // échouent. Cette forme reste correcte en TypeScript classique.
  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = "RetryableError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export interface BackoffOptions {
  /** Tentatives maximum, rejeu initial inclus. */
  maxAttempts?: number;
  /** Délai de base avant le premier rejeu. */
  baseDelayMs?: number;
  /** Plafond appliqué au délai calculé, avant gigue. */
  maxDelayMs?: number;
  /** Injectable pour les tests — évite d'attendre réellement. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Exécute `fn`, en la rejouant à délai exponentiel si elle lève une
 * `RetryableError`. Toute autre erreur remonte immédiatement — la fonction
 * appelante décide elle-même ce qui est transitoire en levant le bon type.
 */
export async function withBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: BackoffOptions = {},
): Promise<T> {
  const {
    maxAttempts = 5,
    baseDelayMs = 400,
    maxDelayMs = 20_000,
    sleep = defaultSleep,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof RetryableError;
      if (!retryable || attempt === maxAttempts) throw err;

      const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      // La gigue va de 50 % à 150 % du délai calculé, pour désynchroniser les
      // rejeux d'appels touchés par le même incident.
      const jittered = exponential * (0.5 + Math.random());
      const delay = err.retryAfterMs ?? jittered;

      await sleep(delay);
    }
  }

  // Inatteignable : la boucle renvoie ou lève avant d'en sortir. Conservé pour
  // que TypeScript n'exige pas un retour explicite après le for.
  throw lastError;
}

/**
 * Traduit une réponse `fetch` en succès ou en `RetryableError` / erreur
 * définitive, à partir de son code de statut.
 */
export async function classifyFetchResponse(response: Response): Promise<Response> {
  if (response.ok) return response;

  if (RETRYABLE_STATUS.has(response.status)) {
    const header = response.headers.get("retry-after");
    const retryAfterMs = header ? parseRetryAfter(header) : undefined;
    throw new RetryableError(
      `Réponse ${response.status} — transitoire, nouvelle tentative prévue.`,
      response.status,
      retryAfterMs,
    );
  }

  const body = await response.text().catch(() => "");
  throw new Error(`Échec définitif (${response.status}) : ${body.slice(0, 300)}`);
}

function parseRetryAfter(header: string): number | undefined {
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}
