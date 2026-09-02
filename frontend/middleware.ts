import { NextResponse, type NextRequest } from "next/server";
import { verifySession, sessionCookie } from "@/lib/server/session";

/**
 * Garde d'accès aux écrans applicatifs.
 *
 * Sans elle, /tableau-de-bord est atteignable en devinant l'URL — n'importe qui
 * verrait les avis et les statistiques d'un artisan.
 *
 * Ce que ce middleware fait, et ce qu'il ne fait PAS :
 *
 * · Il vérifie qu'une session **signée et non expirée** est présente. C'est un
 *   filtre de premier niveau, pas l'autorisation elle-même.
 *
 * · Il ne décide **jamais** si tel utilisateur a le droit de voir telle fiche.
 *   Cette vérification appartient à chaque route de données, au plus près de la
 *   requête SQL — voir lib/server/auth.ts. Un contrôle d'accès qui ne vit que
 *   dans le middleware saute dès qu'une route est appelée autrement.
 *
 * Le middleware s'exécute dans le runtime Edge : d'où l'usage de Web Crypto
 * dans lib/server/session.ts plutôt que de node:crypto.
 */

/**
 * Écrans qui exigent une session.
 *
 * `/admin` et `/abonnement` avaient leur propre contrôle dans la page mais
 * n'étaient pas listés ici : la redirection perdait alors la destination, et
 * l'artisan connecté atterrissait sur le tableau de bord en devant retaper
 * l'adresse. Constaté sur `/admin`.
 *
 * Le middleware ne dit RIEN du rôle : `/admin` vérifie lui-même qu'il s'agit
 * d'un administrateur, au plus près de la donnée. Un contrôle qui ne vit que
 * dans le middleware saute dès qu'une route est appelée autrement.
 */
const PROTECTED = ["/tableau-de-bord", "/admin", "/abonnement"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const session = await verifySession(request.cookies.get(sessionCookie.name)?.value);
  if (session) return NextResponse.next();

  // On mémorise la destination pour y ramener l'artisan après connexion :
  // le renvoyer sur un tableau de bord vide après s'être authentifié est une
  // manière sûre de le perdre.
  const login = new URL("/connexion", request.url);
  login.searchParams.set("suite", pathname);

  const response = NextResponse.redirect(login);
  // Une session invalide ou périmée est effacée au passage, sinon le navigateur
  // la renvoie à chaque requête et le rejet se répète indéfiniment.
  response.cookies.set(sessionCookie.name, "", sessionCookie.clearOptions());
  return response;
}

export const config = {
  // On évite d'exécuter le middleware sur les assets : il n'a rien à y faire et
  // chaque exécution inutile coûte de la latence sur toutes les requêtes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
