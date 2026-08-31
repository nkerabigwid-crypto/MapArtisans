import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { autoriserDemande, composeDemandeAvis, demandeFitsOneSegment } from "@/lib/server/sms/demandeAvis";
import { autoriserEnvoi, messageQuota } from "@/lib/server/sms/quota";
import { assertAffordable, resolveSmsSender } from "@/lib/server/sms/twilio";

export const runtime = "nodejs";

/**
 * Envoie une demande d'avis à un client, après une intervention.
 *
 * CE QUE CETTE ROUTE NE FAIT PAS, ET NE FERA JAMAIS
 *
 * Elle ne demande pas si le client était satisfait, et n'accepte aucun
 * paramètre qui le laisserait entendre. Google interdit de solliciter
 * sélectivement les avis positifs : le jour où cette route accepterait un
 * champ « note » ou « satisfait », elle deviendrait l'outil de filtrage que
 * nous refusons de construire depuis le début.
 *
 * L'artisan envoie à TOUS ses clients, ou à aucun.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession(request.cookies.get(sessionCookie.name)?.value);
  if (!session) {
    return NextResponse.json({ error: "Connectez-vous d'abord." }, { status: 401 });
  }

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const { clientPhone, profileId } = (corps ?? {}) as {
    clientPhone?: unknown;
    profileId?: unknown;
  };
  if (typeof clientPhone !== "string" || typeof profileId !== "string") {
    return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
  }

  const repo = getRepo();
  // Le filtre par propriétaire est DANS la requête : un artisan ne peut pas
  // envoyer au nom de la fiche d'un autre.
  const fiche = await repo.findProfileForUser(session.uid, profileId);
  if (!fiche) {
    return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
  }

  const entreprise = await repo.getCompanyForProfile(fiche.id);

  // Le Place ID vient de la FICHE, jamais des données de démonstration : il est
  // récupéré auprès de Google au rattachement OAuth. Une fiche sans Place ID est
  // écartée juste après par `autoriserDemande`.
  const placeId = fiche.placeId;

  /*
   * Numéro normalisé UNE fois, puis utilisé partout : registre de
   * désabonnement, historique, envoi et trace. Normaliser à chaque usage
   * laisserait « +41 79 … » et « +4179… » cohabiter en base, et un client
   * désabonné sous une forme continuerait de recevoir des SMS sous l'autre.
   */
  const numero = clientPhone.replace(/[\s.\-()]/g, "");

  const [desabonne, dernierEnvoi] = await Promise.all([
    repo.estDesabonne(numero),
    repo.dernierEnvoiAvis(fiche.id, numero),
  ]);

  /*
   * Plafond mensuel AVANT toute autre vérification coûteuse. C'est le seul coût
   * variable non borné du produit : un import de fichier clients ou une boucle
   * peut envoyer des centaines de SMS, et la facture Twilio n'arrive qu'après.
   */
  if (entreprise) {
    const envoyes = await repo.compterSmsDuMois(entreprise.id);
    const quota = autoriserEnvoi(entreprise.planId, envoyes, "demande-avis");
    if (!quota.ok) {
      return NextResponse.json({ error: messageQuota(entreprise.planId) }, { status: 429 });
    }
  }

  const verdict = autoriserDemande({
    clientPhone,
    placeId,
    desabonne,
    dernierEnvoi,
  });

  if (!verdict.ok) {
    const messages: Record<string, string> = {
      "numero-invalide": "Ce numéro ne semble pas valide. Format attendu : +41 79 123 45 67.",
      desabonne: "Ce client a demandé à ne plus recevoir de SMS.",
      "deja-sollicite": "Ce client a déjà reçu une demande il y a moins de trois mois.",
      "fiche-sans-place-id": "Connectez votre fiche Google pour pouvoir demander des avis.",
    };
    return NextResponse.json(
      { error: messages[verdict.raison] ?? "Envoi impossible." },
      { status: 400 },
    );
  }

  const message = composeDemandeAvis({
    placeId: placeId!,
    businessName: fiche.businessName,
    brandName: entreprise ? null : null,
  });

  // Garde-fou de coût avant l'envoi, comme pour le rapport hebdomadaire : un
  // message devenu trop long doit échouer visiblement, pas partir en trois
  // segments facturés à chaque intervention.
  if (!demandeFitsOneSegment(message)) {
    console.error(`[avis] message à plus d'un segment pour ${fiche.id}`);
    return NextResponse.json({ error: "Message trop long." }, { status: 500 });
  }
  assertAffordable(message, 1);

  try {
    await resolveSmsSender().send(numero, message);
    /*
     * La trace est écrite APRÈS un envoi réussi. L'écrire avant bloquerait le
     * client trois mois sur un SMS jamais parti ; l'omettre laisserait l'artisan
     * le solliciter tous les jours.
     */
    await repo.enregistrerDemandeAvis({
      profileId: fiche.id,
      clientPhone: numero,
      statut: "sent",
    });
    // Compté APRÈS l'envoi réussi : un échec Twilio n'est pas facturé, il ne
    // doit donc pas consommer le plafond de l'artisan.
    if (entreprise) await repo.incrementerSmsDuMois(entreprise.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const raison = err instanceof Error ? err.message : String(err);
    console.error(`[avis] envoi échoué pour ${fiche.id} : ${raison}`);
    /*
     * L'échec est tracé lui aussi : l'historique documente la NON-SÉLECTION
     * exigée par Google — nous sollicitons tous les clients, pas seulement les
     * contents. Un registre où ne figurent que les succès ne prouve plus rien.
     */
    await repo.enregistrerDemandeAvis({
      profileId: fiche.id,
      clientPhone: numero,
      statut: "failed",
      motifEchec: raison.slice(0, 500),
    });
    return NextResponse.json(
      { error: "L'envoi a échoué. Réessayez dans un instant." },
      { status: 503 },
    );
  }
}
