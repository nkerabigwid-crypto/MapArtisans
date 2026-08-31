import { NextResponse, type NextRequest } from "next/server";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { getRepo } from "@/lib/server/repo";
import { encryptToken } from "@/lib/server/crypto";
import { echangerCode, lireConfig } from "@/lib/server/google/oauth";
import { COOKIE_ETAT, verifierEtat } from "@/lib/server/google/etat";
import { listerEtablissements } from "@/lib/server/google/etablissements";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

/** Retour vers le tableau de bord, en effaçant toujours le cookie d'état. */
function retour(motif: string) {
  const reponse = NextResponse.redirect(
    new URL(`/tableau-de-bord?google=${motif}`, SITE_URL),
  );
  reponse.cookies.set(COOKIE_ETAT, "", {
    path: "/api/auth/google",
    maxAge: 0,
  });
  return reponse;
}

/**
 * Retour de Google après consentement.
 *
 * Toutes les issues d'échec renvoient un motif générique côté URL : le détail
 * part dans les journaux du serveur. Un message précis afficherait à un tiers
 * l'état interne du flux — état expiré, discordant, appartenant à un autre
 * compte — ce qui est précisément ce qu'il cherche à sonder.
 */
export async function GET(request: NextRequest) {
  const session = await verifySession(
    request.cookies.get(sessionCookie.name)?.value,
  );
  if (!session) return NextResponse.redirect(new URL("/connexion", SITE_URL));

  const params = request.nextUrl.searchParams;

  // L'artisan a pu cliquer « Annuler » sur l'écran de consentement : ce n'est
  // pas une erreur, et ça ne doit pas ressembler à une panne.
  const refus = params.get("error");
  if (refus) {
    console.info("[google] consentement refusé :", refus);
    return retour("annule");
  }

  const verdict = await verifierEtat({
    cookie: request.cookies.get(COOKIE_ETAT)?.value,
    stateRecu: params.get("state"),
    userId: session.uid,
  });
  if (!verdict.ok) {
    console.warn("[google] état rejeté :", verdict.raison);
    return retour("echec");
  }

  const code = params.get("code");
  if (!code) return retour("echec");

  try {
    const config = lireConfig();
    const jetons = await echangerCode({
      config,
      code,
      codeVerifier: verdict.etat.codeVerifier,
    });

    const etablissements = await listerEtablissements(jetons.accessToken);
    if (etablissements.length === 0) {
      // Compte Google valide, mais aucun établissement : l'artisan s'est
      // connecté avec un compte personnel, ou sa fiche n'est pas encore
      // validée par Google. Les deux se corrigent sans support.
      return retour("aucun-etablissement");
    }

    const repo = getRepo();
    const entreprise = await repo.findCompanyForUser(verdict.etat.userId);
    if (!entreprise) return retour("echec");

    /*
     * Les deux jetons sont chiffrés AVANT d'atteindre la base. Le jeton de
     * rafraîchissement est le plus sensible du produit : il vaut un accès
     * durable à la fiche Google d'un client, bien au-delà de l'heure de
     * validité du jeton d'accès.
     */
    const accessTokenEnc = await encryptToken(jetons.accessToken);
    const refreshTokenEnc = jetons.refreshToken
      ? await encryptToken(jetons.refreshToken)
      : null;

    for (const etablissement of etablissements) {
      await repo.upsertGoogleProfile({
        companyId: entreprise.id,
        googleLocationId: etablissement.locationId,
        placeId: etablissement.placeId,
        businessName: etablissement.businessName,
        address: etablissement.address,
        city: etablissement.city,
        latitude: etablissement.latitude,
        longitude: etablissement.longitude,
        accessTokenEnc,
        refreshTokenEnc,
      });
    }

    return retour("connecte");
  } catch (erreur) {
    // Le message peut contenir la réponse brute de Google : il reste dans les
    // journaux, jamais dans l'URL du navigateur.
    console.error("[google] rattachement échoué :", erreur);
    return retour("echec");
  }
}
