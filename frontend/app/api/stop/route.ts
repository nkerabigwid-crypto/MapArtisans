import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";

export const runtime = "nodejs";

/**
 * Désabonnement des SMS.
 *
 * ADRESSE PUBLIQUE ET SANS AUTHENTIFICATION, PAR NÉCESSITÉ
 *
 * Elle est appelée par le client d'un artisan, qui n'a aucun compte chez nous.
 * Exiger une identification reviendrait à rendre le refus impossible — soit
 * exactement ce que la loi interdit.
 *
 * LE RISQUE D'ABUS EST ASYMÉTRIQUE, ET C'EST CE QUI PERMET DE L'ACCEPTER
 *
 * Quelqu'un pourrait désabonner un numéro qui n'est pas le sien. Le préjudice
 * se limite à une demande d'avis non envoyée. À l'inverse, un désabonnement
 * impossible expose l'artisan à une plainte et le compte Twilio à une
 * suspension. Sur-supprimer coûte moins cher que sous-supprimer.
 */

/** E.164 : le seul format que Twilio accepte, donc le seul qui puisse être en base. */
const E164 = /^\+[1-9]\d{6,14}$/;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const brut = form?.get("phone");

  if (typeof brut !== "string") {
    return NextResponse.redirect(new URL("/stop?e=1", request.url), 303);
  }

  // Les espaces, points et tirets sont fréquents dans un numéro recopié à la
  // main : les refuser ferait échouer un désabonnement légitime.
  const numero = brut.replace(/[\s.\-()]/g, "");
  if (!E164.test(numero)) {
    return NextResponse.redirect(new URL("/stop?e=1", request.url), 303);
  }

  try {
    await getRepo().enregistrerDesabonnement(numero);
  } catch (erreur) {
    console.error("[stop] désabonnement échoué :", erreur);
    return NextResponse.redirect(new URL("/stop?e=2", request.url), 303);
  }

  // 303 : la redirection après POST évite qu'un rafraîchissement renvoie le
  // formulaire.
  return NextResponse.redirect(new URL("/stop?ok=1", request.url), 303);
}
