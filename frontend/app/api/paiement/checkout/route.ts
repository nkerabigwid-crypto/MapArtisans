import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { creerSessionCheckout } from "@/lib/server/paiement/stripe";
import { PLANS, type PlanId } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

/**
 * Ouvre une session de paiement Stripe.
 *
 * L'UTILISATEUR VIENT DE LA SESSION, JAMAIS DU CORPS DE LA REQUÊTE
 *
 * La spécification d'origine prévoyait de recevoir `userId` en paramètre.
 * C'est une faille directe : n'importe qui posterait l'identifiant d'un autre
 * et lui ouvrirait un abonnement — ou, en le combinant au webhook,
 * s'activerait un compte au nom d'un tiers. L'identité vient du cookie signé.
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

  const { planId } = (corps ?? {}) as { planId?: unknown };
  if (typeof planId !== "string" || !PLANS.some((p) => p.id === planId)) {
    return NextResponse.json({ error: "Formule inconnue." }, { status: 400 });
  }

  const repo = getRepo();
  const utilisateur = await repo.findUserById(session.uid);
  if (!utilisateur) {
    return NextResponse.json({ error: "Compte introuvable." }, { status: 401 });
  }

  try {
    const { url } = await creerSessionCheckout({
      planId: planId as PlanId,
      userId: utilisateur.id,
      email: utilisateur.email,
      baseUrl: SITE_URL,
    });
    return NextResponse.json({ url });
  } catch (err) {
    const raison = err instanceof Error ? err.message : String(err);
    console.error(`[paiement] session refusée pour ${utilisateur.id} : ${raison}`);
    // Le détail reste dans les journaux : il peut contenir des indications sur
    // la configuration du compte Stripe, qui n'ont pas à sortir.
    return NextResponse.json(
      { error: "Le paiement est momentanément indisponible." },
      { status: 503 },
    );
  }
}
