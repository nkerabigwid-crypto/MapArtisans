import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { autoriserDemande, composeDemandeAvis, demandeFitsOneSegment } from "@/lib/server/sms/demandeAvis";
import { assertAffordable, resolveSmsSender } from "@/lib/server/sms/twilio";
import { qrCode } from "@/lib/data";

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

  // Les données de démonstration portent le place_id tant que l'OAuth Google
  // n'est pas branché ; ensuite il viendra de la fiche elle-même.
  const placeId = qrCode.place_id;

  const verdict = autoriserDemande({
    clientPhone,
    placeId,
    // Registre de désabonnement et historique : à brancher sur le dépôt quand
    // les méthodes existeront. Pour l'instant, la garde de format et de
    // place_id est déjà appliquée.
    desabonne: false,
    dernierEnvoi: null,
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
    await resolveSmsSender().send(clientPhone.replace(/[\s.\-()]/g, ""), message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const raison = err instanceof Error ? err.message : String(err);
    console.error(`[avis] envoi échoué pour ${fiche.id} : ${raison}`);
    return NextResponse.json(
      { error: "L'envoi a échoué. Réessayez dans un instant." },
      { status: 503 },
    );
  }
}
