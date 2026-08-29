import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Jamais mise en cache : une sonde de santé qui répond depuis un cache dirait
// « tout va bien » alors que le serveur ne répond plus.
export const dynamic = "force-dynamic";

/**
 * Sonde de santé, consommée par le HEALTHCHECK Docker et par Caddy.
 *
 * ELLE NE VÉRIFIE QUE CE SERVEUR, VOLONTAIREMENT
 *
 * Il est tentant d'y tester aussi PostgreSQL et Redis. C'est un piège connu :
 * si la sonde échoue quand Redis tombe, l'orchestrateur redémarre le serveur
 * web — qui n'a rien fait de mal — et le site public devient indisponible pour
 * une panne qui ne l'empêchait pas de servir des pages. Les dépendances se
 * surveillent séparément.
 *
 * Elle ne divulgue rien non plus : ni version, ni variables, ni état interne.
 * Une sonde est publique par nature, puisqu'elle doit répondre avant toute
 * authentification.
 */
export async function GET() {
  return NextResponse.json({ statut: "ok" }, { headers: { "cache-control": "no-store" } });
}
