// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { RetryableError, withBackoff } from "@/lib/server/resilience";
import { measureSms } from "./gsm7";

/**
 * Envoi de SMS — interface et implémentation Twilio.
 *
 * Comme pour OpenAI, le reste du pipeline ne dépend que de l'interface
 * `SmsSender`. C'est ce qui permet de tester le worker de bout en bout sans
 * identifiants Twilio valides — nécessaire ici, la clé API fournie n'ayant
 * aucune permission attachée (erreur 70051 à la vérification).
 */

export interface SmsSender {
  send(to: string, body: string): Promise<void>;
}

/**
 * Refuse tout envoi tant que Twilio n'est pas configuré, avec un message qui
 * dit quoi faire. Délibérément différent d'un faux succès : celui-ci
 * masquerait, en production, le jour où la configuration devient valide mais
 * où le vrai client n'a pas été branché.
 */
export const notConfiguredSender: SmsSender = {
  async send() {
    throw new Error(
      "TWILIO_NOT_CONFIGURED — identifiants incomplets. Il faut " +
        "TWILIO_ACCOUNT_SID et TWILIO_FROM_NUMBER, plus SOIT le couple " +
        "TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET, SOIT TWILIO_AUTH_TOKEN. " +
        "Note : une clé API créée sans rôle attaché renvoie l'erreur Twilio " +
        "70051 alors même que ses identifiants sont corrects.",
    );
  },
};

/**
 * Construit l'expéditeur réel à partir de l'environnement, ou refuse.
 *
 * Twilio accepte deux couples d'identifiants pour l'authentification Basic,
 * et l'un comme l'autre convient :
 *
 *  · **Clé API** (`SK…` + secret) — à privilégier : révocable seule, sans
 *    toucher au compte, et limitable à un rôle précis.
 *  · **Auth Token du compte** (`AC…` + token) — plus simple à mettre en place,
 *    mais il ouvre TOUS les droits du compte. Acceptable pour démarrer, à
 *    remplacer par une clé API avant la production.
 *
 * La clé API est essayée en premier ; le token sert de repli. Ce choix évite
 * qu'une clé API mal configurée — sans rôle attaché, elle renvoie l'erreur
 * Twilio 70051 — bloque tout le pipeline alors qu'un token valide existe.
 */
export function resolveSmsSender(): SmsSender {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !from) return notConfiguredSender;

  const keySid = process.env.TWILIO_API_KEY_SID;
  const keySecret = process.env.TWILIO_API_KEY_SECRET;
  if (keySid && keySecret) {
    return createTwilioSender({ accountSid, username: keySid, password: keySecret, from });
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    return createTwilioSender({ accountSid, username: accountSid, password: authToken, from });
  }

  return notConfiguredSender;
}

export interface TwilioConfig {
  accountSid: string;
  /** SID de clé API (`SK…`), ou Account SID si l'on passe par l'Auth Token. */
  username: string;
  /** Secret de la clé API, ou Auth Token du compte. */
  password: string;
  /**
   * Expéditeur affiché sur le téléphone du destinataire.
   *
   * Twilio accepte deux formes dans ce champ :
   *
   *   · un NUMÉRO au format E.164 (« +41766014450 ») — le destinataire peut
   *     répondre ;
   *   · un EXPÉDITEUR ALPHANUMÉRIQUE (« MapArtisans »), 11 caractères au plus,
   *     qui affiche un nom au lieu d'un numéro. Aucune réponse n'est alors
   *     possible, et aucun numéro n'a besoin d'être loué — donc aucun dossier
   *     réglementaire à faire valider.
   *
   * La seconde forme est préférable pour un envoi à sens unique : un artisan
   * suisse dont le SMS arrive d'un numéro américain se fait filtrer comme
   * indésirable, quand un nom lisible passe et inspire confiance.
   *
   * CONSÉQUENCE À NE PAS OUBLIER : sans numéro, le « STOP » ne peut pas être
   * reçu. Le moyen de se désabonner doit alors figurer dans le message ou
   * passer par un autre canal.
   */
  from: string;
}

export function createTwilioSender(config: TwilioConfig): SmsSender {
  return {
    async send(to, body) {
      // L'appel REST direct évite d'ajouter le SDK Twilio (et ses
      // dépendances) pour une seule requête POST. La contrepartie — gérer
      // soi-même l'encodage du corps et les codes d'erreur — est assumée ici
      // et couverte par les tests.
      const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
      const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

      await withBackoff(async () => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: config.from, Body: body }),
        });

        if (response.ok) return;

        // 429 (quota) et 5xx sont transitoires ; une 401 ou une 400 ne le sont
        // pas — les rejouer gaspillerait du temps sans jamais aboutir.
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = response.headers.get("retry-after");
          throw new RetryableError(
            `Twilio a répondu ${response.status}`,
            response.status,
            retryAfter ? Number(retryAfter) * 1000 : undefined,
          );
        }

        const text = await response.text().catch(() => "");
        throw new Error(`Échec définitif d'envoi (${response.status}) : ${text.slice(0, 300)}`);
      });
    },
  };
}

/**
 * Garde-fou de coût, à appeler avant tout envoi.
 *
 * Lève si le message dépasse le nombre de segments autorisé. Sans cette
 * vérification, une formulation malheureuse dans un futur gabarit ferait
 * silencieusement tripler la facture SMS sur l'ensemble du parc — le genre de
 * dérive qu'on ne découvre qu'à la facture.
 */
export function assertAffordable(body: string, maxSegments = 1): void {
  const cost = measureSms(body);
  if (cost.segments > maxSegments) {
    const detail = cost.offenders.length
      ? ` Caractères hors GSM-7 : ${cost.offenders.join(" ")}.`
      : "";
    throw new Error(
      `SMS trop long : ${cost.segments} segments (${cost.encoding}, ${cost.units} unités), ` +
        `maximum ${maxSegments}.${detail}`,
    );
  }
}
