/**
 * OAuth Google — obtention du droit d'agir sur une fiche d'établissement.
 *
 * C'est la pièce qui manquait : le reste du produit sait publier une réponse
 * (`createGooglePublisher`), mais rien ne savait obtenir l'autorisation de le
 * faire. Sans ce module, `google_profiles` reste vide et toute la boucle —
 * lire les avis, répondre, suivre la position — n'a aucune fiche à traiter.
 *
 * Ce fichier ne contient que de la logique pure et des appels HTTP injectables.
 * Les routes s'occupent des cookies et des redirections.
 */

/** Le seul périmètre demandé. Google refuse les périmètres non justifiés. */
export const PERIMETRE = "https://www.googleapis.com/auth/business.manage";

const URL_AUTORISATION = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_JETON = "https://oauth2.googleapis.com/token";

/**
 * Durée de vie du lien d'autorisation en cours.
 *
 * Dix minutes : assez pour choisir un compte Google et lire l'écran de
 * consentement, trop court pour qu'un `state` récupéré dans un historique de
 * navigateur partagé reste rejouable.
 */
export const VALIDITE_ETAT_MS = 10 * 60_000;

export class ConfigurationGoogleAbsente extends Error {
  constructor(variable: string) {
    super(
      `${variable} n'est pas défini. La connexion Google est indisponible ` +
        `tant que les identifiants OAuth ne sont pas configurés.`,
    );
    this.name = "ConfigurationGoogleAbsente";
  }
}

export class EchangeOAuthEchoue extends Error {
  readonly statut: number;
  constructor(statut: number, detail: string) {
    super(`Google a refusé l'échange (${statut}) : ${detail}`);
    this.name = "EchangeOAuthEchoue";
    this.statut = statut;
  }
}

export interface ConfigOAuth {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Lit la configuration OAuth, ou explique précisément ce qui manque.
 *
 * Volontairement appelée à chaque usage plutôt que figée au chargement du
 * module : une variable absente doit produire une erreur au moment où
 * l'artisan clique, pas empêcher le serveur entier de démarrer.
 */
export function lireConfig(env: NodeJS.ProcessEnv = process.env): ConfigOAuth {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_REDIRECT_URI;
  if (!clientId) throw new ConfigurationGoogleAbsente("GOOGLE_CLIENT_ID");
  if (!clientSecret) throw new ConfigurationGoogleAbsente("GOOGLE_CLIENT_SECRET");
  if (!redirectUri) throw new ConfigurationGoogleAbsente("GOOGLE_REDIRECT_URI");
  return { clientId, clientSecret, redirectUri };
}

/** `true` si la connexion Google peut être proposée à l'artisan. */
export function googleConfigure(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI,
  );
}

export function construireUrlAutorisation(input: {
  config: ConfigOAuth;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(URL_AUTORISATION);
  const p = url.searchParams;
  p.set("client_id", input.config.clientId);
  p.set("redirect_uri", input.config.redirectUri);
  p.set("response_type", "code");
  p.set("scope", PERIMETRE);
  p.set("state", input.state);
  p.set("code_challenge", input.codeChallenge);
  p.set("code_challenge_method", "S256");
  /*
   * `offline` est ce qui fait exister le jeton de rafraîchissement. Sans lui,
   * l'accès expire au bout d'une heure et le worker cesse silencieusement de
   * répondre aux avis la nuit suivante — sans erreur visible, la fiche
   * paraîtrait simplement inactive.
   */
  p.set("access_type", "offline");
  /*
   * Google n'émet un jeton de rafraîchissement qu'à la PREMIÈRE autorisation.
   * Un artisan qui reconnecte sa fiche (changement de compte, révocation)
   * repartirait sans jeton durable. `consent` force le renvoi à chaque fois.
   */
  p.set("prompt", "consent");
  return url.toString();
}

export interface JetonsGoogle {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}

type Fetch = typeof globalThis.fetch;

async function postJeton(
  corps: URLSearchParams,
  fetchImpl: Fetch,
): Promise<JetonsGoogle> {
  const reponse = await fetchImpl(URL_JETON, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corps.toString(),
  });
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new EchangeOAuthEchoue(reponse.status, texte.slice(0, 300));
  }
  const data = JSON.parse(texte) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new EchangeOAuthEchoue(reponse.status, "réponse sans access_token");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? 3600,
  };
}

export async function echangerCode(input: {
  config: ConfigOAuth;
  code: string;
  codeVerifier: string;
  fetchImpl?: Fetch;
}): Promise<JetonsGoogle> {
  const corps = new URLSearchParams({
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    redirect_uri: input.config.redirectUri,
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.codeVerifier,
  });
  return postJeton(corps, input.fetchImpl ?? globalThis.fetch);
}

export async function rafraichirJeton(input: {
  config: ConfigOAuth;
  refreshToken: string;
  fetchImpl?: Fetch;
}): Promise<JetonsGoogle> {
  const corps = new URLSearchParams({
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
  return postJeton(corps, input.fetchImpl ?? globalThis.fetch);
}
