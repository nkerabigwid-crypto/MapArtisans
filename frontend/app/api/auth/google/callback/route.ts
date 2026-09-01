import { NextResponse, type NextRequest } from "next/server";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { getRepo } from "@/lib/server/repo";
import { enqueueWeeklyReports } from "@/lib/server/queue/reportQueue";
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
      const fiche = await repo.upsertGoogleProfile({
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

      /*
       * Les réglages de l'assistant naissent avec la fiche. Sans cette ligne, la
       * clé de widget n'existe nulle part et l'assistant reste inatteignable —
       * exactement le défaut qu'on vient de corriger sur la route elle-même.
       *
       * Idempotent : une reconnexion ne regénère pas la clé, qui est déjà collée
       * dans le HTML du site de l'artisan.
       */
      await repo.creerReglagesAssistant(fiche.id);
    }

    /*
     * PREMIER RAPPORT IMMÉDIAT, sans attendre le lundi suivant.
     *
     * L'essai dure quatorze jours. Un artisan qui connecte sa fiche un mardi ne
     * recevrait le rapport hebdomadaire que le lundi d'après — soit après la
     * fin de son essai. Il n'aurait donc jamais vu l'argument central du
     * produit avant de décider s'il paie.
     *
     * La mise en file est déduplicée par semaine ISO : si le planificateur
     * passe ensuite dans la même semaine, aucun doublon n'est créé.
     */
    try {
      await enqueueWeeklyReports(repo);
    } catch (erreur) {
      // Un rapport non parti ne doit pas faire échouer le rattachement, qui
      // vient de réussir et qui est ce que l'artisan attendait.
      console.error("[google] premier rapport non mis en file :", erreur);
    }

    return retour("connecte");
  } catch (erreur) {
    // Le message peut contenir la réponse brute de Google : il reste dans les
    // journaux, jamais dans l'URL du navigateur.
    console.error("[google] rattachement échoué :", erreur);
    return retour("echec");
  }
}
