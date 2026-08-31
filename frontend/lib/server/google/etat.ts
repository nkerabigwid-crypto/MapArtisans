/**
 * État anti-rejeu et PKCE du flux OAuth.
 *
 * Deux protections distinctes, souvent confondues :
 *
 * - Le `state` empêche qu'un tiers déclenche la redirection de retour depuis
 *   son propre navigateur pour rattacher SA fiche Google au compte de
 *   l'artisan. Sans lui, un attaquant lie sa fiche au compte d'autrui.
 * - Le PKCE empêche qu'un code d'autorisation intercepté (historique, journal
 *   de serveur mandataire, extension de navigateur) soit échangé par quelqu'un
 *   d'autre : l'échange exige le secret d'origine, jamais transmis dans l'URL.
 *
 * Les deux valeurs voyagent dans un cookie chiffré et non dans une table :
 * l'état ne survit pas à la redirection, il n'a aucune raison d'être persisté.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptToken, encryptToken } from "@/lib/server/crypto";
import { VALIDITE_ETAT_MS } from "@/lib/server/google/oauth";

export interface EtatOAuth {
  state: string;
  codeVerifier: string;
  /** Horodatage d'émission, en millisecondes. */
  emisA: number;
  /** Utilisateur connecté au moment du départ ; la fiche lui sera rattachée. */
  userId: string;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function genererEtat(userId: string, maintenant = Date.now()): EtatOAuth {
  return {
    state: base64url(randomBytes(32)),
    // 32 octets → 43 caractères base64url, dans les bornes RFC 7636 (43–128).
    codeVerifier: base64url(randomBytes(32)),
    emisA: maintenant,
    userId,
  };
}

export function defiDepuisVerifieur(codeVerifier: string): string {
  return base64url(createHash("sha256").update(codeVerifier).digest());
}

export async function chiffrerEtat(etat: EtatOAuth): Promise<string> {
  return encryptToken(JSON.stringify(etat));
}

/** Nom du cookie portant l'état. Éphémère, supprimé dès le retour traité. */
export const COOKIE_ETAT = "google_oauth";

export type EchecEtat =
  | "absent"
  | "illisible"
  | "expire"
  | "discordant"
  | "autre_utilisateur";

export type ResultatEtat =
  | { ok: true; etat: EtatOAuth }
  | { ok: false; raison: EchecEtat };

/**
 * Compare deux `state` sans fuite de temps.
 *
 * Le gain est théorique sur une valeur aléatoire de 256 bits, mais une
 * comparaison constante ne coûte rien et évite d'avoir à re-justifier
 * l'exception le jour où quelqu'un audite le fichier.
 */
function memeState(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function verifierEtat(input: {
  cookie: string | undefined;
  stateRecu: string | null;
  userId: string;
  maintenant?: number;
}): Promise<ResultatEtat> {
  if (!input.cookie || !input.stateRecu) return { ok: false, raison: "absent" };

  let etat: EtatOAuth;
  try {
    etat = JSON.parse(await decryptToken(input.cookie)) as EtatOAuth;
  } catch {
    // Cookie forgé, tronqué, ou chiffré avec une clé désormais tournée.
    return { ok: false, raison: "illisible" };
  }

  const maintenant = input.maintenant ?? Date.now();
  if (maintenant - etat.emisA > VALIDITE_ETAT_MS) {
    return { ok: false, raison: "expire" };
  }
  if (!memeState(etat.state, input.stateRecu)) {
    return { ok: false, raison: "discordant" };
  }
  /*
   * L'artisan a pu changer de compte entre le départ et le retour (déconnexion
   * puis reconnexion sous un autre compte dans un second onglet). Rattacher la
   * fiche à la session courante donnerait la fiche au mauvais utilisateur.
   */
  if (etat.userId !== input.userId) {
    return { ok: false, raison: "autre_utilisateur" };
  }
  return { ok: true, etat };
}
