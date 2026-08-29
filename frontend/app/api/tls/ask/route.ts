import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { normalizeHost } from "@/lib/server/branding";

export const runtime = "nodejs";

/**
 * Point de contrôle « ask » pour le TLS à la demande de Caddy.
 *
 * POURQUOI CETTE ROUTE EXISTE
 *
 * Caddy sait obtenir un certificat Let's Encrypt à la volée pour un domaine
 * qu'il découvre à la première connexion — c'est ce qui rend la marque blanche
 * possible sans intervention manuelle. Mais la documentation Caddy est
 * explicite : « On-demand TLS must be both enabled and restricted to prevent
 * abuse. »
 *
 * Sans cette restriction, n'importe qui pointant n'importe quel domaine vers
 * notre serveur déclenche une demande de certificat. Les quotas Let's Encrypt
 * s'épuisent, et plus AUCUN certificat ne peut être émis — y compris pour nos
 * vraies agences — pendant une semaine. Les limites de Caddy étant globales et
 * non configurables par site, c'est tout le parc qui tombe d'un coup.
 *
 * Cette route répond donc à une seule question : ce domaine appartient-il à
 * une agence enregistrée ?
 *
 * Configuration Caddy correspondante :
 *
 *   {
 *     on_demand_tls {
 *       ask https://mapartisans.com/api/tls/ask
 *     }
 *   }
 *
 * Contrat attendu par Caddy : 200 pour autoriser, tout autre code pour refuser.
 */
export async function GET(request: NextRequest) {
  const brut = request.nextUrl.searchParams.get("domain");
  const domaine = normalizeHost(brut);

  // Un domaine absent ou malformé est refusé sans consulter la base : inutile
  // de faire une requête pour une valeur qui ne peut correspondre à rien.
  if (!domaine) {
    return new NextResponse("domaine invalide", { status: 400 });
  }

  const agence = await getRepo().findAgencyByDomain(domaine);
  if (!agence) {
    // 404 plutôt que 403 : le domaine n'est pas enregistré, ce n'est pas un
    // refus d'autorisation. Caddy traite tout code non-200 comme un refus.
    return new NextResponse("domaine non enregistre", { status: 404 });
  }

  return new NextResponse("ok", { status: 200 });
}
