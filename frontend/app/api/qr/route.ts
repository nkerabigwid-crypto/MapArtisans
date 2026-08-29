import { NextResponse, type NextRequest } from "next/server";
import { generateReviewQr } from "@/lib/server/qr";
import { qrCode } from "@/lib/data";

export const runtime = "nodejs";

/**
 * Sert le QR code de collecte d'avis, au format SVG.
 *
 * POURQUOI UNE ROUTE PLUTÔT QU'UNE GÉNÉRATION DANS LA PAGE
 *
 * Le tableau de bord est un composant client ; la bibliothèque de génération
 * est serveur. Une route évite d'embarquer l'encodeur QR dans le paquet envoyé
 * au navigateur, et donne en prime une URL stable — donc téléchargeable et
 * imprimable directement, sans passer par un blob JavaScript.
 *
 * POURQUOI LE place_id N'EST PAS UN PARAMÈTRE
 *
 * Accepter un identifiant arbitraire ferait de cette route un générateur de QR
 * codes ouvert, utilisable par n'importe qui pour fabriquer des liens d'avis
 * vers n'importe quelle fiche. La fiche vient donc du serveur.
 *
 * Aujourd'hui elle vient des données de démonstration : tant que l'OAuth Google
 * n'est pas branché, aucune fiche réelle n'a de place_id. Le jour où il l'est,
 * seule la ligne ci-dessous change — on lit la session, puis la fiche de
 * l'utilisateur.
 */
export async function GET(request: NextRequest) {
  const placeId = qrCode.place_id;
  if (!placeId) {
    return new NextResponse("Fiche Google pas encore connectee.", { status: 409 });
  }

  const svg = await generateReviewQr(placeId);
  const telecharger = request.nextUrl.searchParams.get("telecharger") === "1";

  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Le QR est une fonction pure de l'URL d'avis : il ne change que si la
      // fiche change. Un cache long évite de le recalculer à chaque affichage.
      "cache-control": "private, max-age=3600",
      ...(telecharger
        ? { "content-disposition": `attachment; filename="qr-code-avis.svg"` }
        : {}),
    },
  });
}
