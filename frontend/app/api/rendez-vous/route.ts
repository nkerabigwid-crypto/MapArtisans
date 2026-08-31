import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { verifySession, sessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/**
 * Statut d'un rendez-vous : honoré ou annulé.
 *
 * Le filtre de propriété vit dans la requête SQL du dépôt, pas ici : c'est la
 * seule façon qu'aucune route ne puisse l'oublier. Un identifiant deviné ne
 * doit pas laisser modifier l'agenda d'un autre artisan.
 */
export async function PATCH(request: NextRequest) {
  const session = await verifySession(request.cookies.get(sessionCookie.name)?.value);
  if (!session) {
    return NextResponse.json({ error: "Connectez-vous d'abord." }, { status: 401 });
  }

  let corps: { ficheId?: unknown; rendezVousId?: unknown; statut?: unknown };
  try {
    corps = (await request.json()) as typeof corps;
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const { ficheId, rendezVousId, statut } = corps;
  if (typeof ficheId !== "string" || typeof rendezVousId !== "string") {
    return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
  }
  if (statut !== "honored" && statut !== "canceled") {
    // `honored` et non `done` : vocabulaire imposé par la contrainte de la
    // migration 016. Refuser tôt évite une erreur SQL illisible.
    return NextResponse.json({ error: "Statut inconnu." }, { status: 400 });
  }

  const repo = getRepo();
  const fiche = await repo.findProfileForUser(session.uid, ficheId);
  if (!fiche) {
    return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
  }

  try {
    await repo.majStatutRendezVous({ rendezVousId, profileId: fiche.id, statut });
    return NextResponse.json({ ok: true, statut });
  } catch {
    return NextResponse.json({ error: "Rendez-vous introuvable." }, { status: 404 });
  }
}
