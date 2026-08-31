import { NextResponse, type NextRequest } from "next/server";
import { verifySession, sessionCookie } from "@/lib/server/session";
import {
  ConfigurationGoogleAbsente,
  construireUrlAutorisation,
  lireConfig,
} from "@/lib/server/google/oauth";
import {
  COOKIE_ETAT,
  chiffrerEtat,
  defiDepuisVerifieur,
  genererEtat,
} from "@/lib/server/google/etat";
import { SITE_URL } from "@/lib/site";

/** node:crypto pour l'aléa et le chiffrement de l'état. */
export const runtime = "nodejs";

/**
 * Départ du rattachement d'une fiche Google.
 *
 * L'IDENTITÉ VIENT DE LA SESSION, JAMAIS DE L'URL
 *
 * L'utilisateur est scellé dans l'état chiffré au moment du départ. Le retour
 * le relit de là et non de la session courante : sans cela, un artisan qui
 * change de compte entre l'aller et le retour verrait la fiche atterrir sur le
 * mauvais compte.
 */
export async function GET(request: NextRequest) {
  const session = await verifySession(
    request.cookies.get(sessionCookie.name)?.value,
  );
  if (!session) {
    return NextResponse.redirect(new URL("/connexion", SITE_URL));
  }

  let config;
  try {
    config = lireConfig();
  } catch (erreur) {
    if (erreur instanceof ConfigurationGoogleAbsente) {
      /*
       * Cas normal tant que l'accès à l'API Google Business Profile n'est pas
       * accordé. On renvoie l'artisan vers son tableau de bord avec un motif
       * lisible, plutôt qu'une erreur 500 qui laisserait croire à une panne.
       */
      return NextResponse.redirect(
        new URL("/tableau-de-bord?google=indisponible", SITE_URL),
      );
    }
    throw erreur;
  }

  const etat = genererEtat(session.uid);
  const url = construireUrlAutorisation({
    config,
    state: etat.state,
    codeChallenge: defiDepuisVerifieur(etat.codeVerifier),
  });

  const reponse = NextResponse.redirect(url);
  reponse.cookies.set(COOKIE_ETAT, await chiffrerEtat(etat), {
    httpOnly: true,
    // `lax` et non `strict` : le retour de Google est une navigation
    // inter-site, et `strict` empêcherait le cookie d'être renvoyé — le flux
    // échouerait systématiquement à la dernière étape.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return reponse;
}
