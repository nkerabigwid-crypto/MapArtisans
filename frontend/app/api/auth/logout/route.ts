import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

/**
 * Déconnexion.
 *
 * En POST et non en GET : une déconnexion est une action, et un GET déclenché
 * par une simple balise `<img>` sur un site tiers déconnecterait l'artisan à
 * son insu.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, "", sessionCookie.clearOptions());
  return response;
}
