import { NextResponse, type NextRequest } from "next/server";
import { getRepo, normalizeEmail } from "@/lib/server/repo";
import { verifyPassword } from "@/lib/server/password";
import { createSession, sessionCookie } from "@/lib/server/session";

/**
 * Connexion.
 *
 * Runtime Node explicite : scrypt vient de `node:crypto`, absent de l'Edge.
 */
export const runtime = "nodejs";

/**
 * Fenêtre de limitation par adresse IP.
 *
 * En mémoire, donc remis à zéro à chaque redémarrage et non partagé entre
 * instances : c'est un garde-fou de développement, pas la vraie protection.
 * En production, cet état doit vivre dans Redis ou équivalent — sinon une
 * attaque par force brute contourne la limite en frappant une autre instance.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60_000;

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

  if (tooManyAttempts(ip)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quinze minutes." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
  }

  const repo = getRepo();
  const user = await repo.findUserByEmail(normalizeEmail(email));

  // Le mot de passe est vérifié même lorsque le compte n'existe pas, contre un
  // hachage factice. Sans cela, la durée de réponse révèle quelles adresses
  // sont enregistrées — de quoi énumérer la clientèle.
  const reference =
    user?.passwordHash ??
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const ok = await verifyPassword(password, reference);

  if (!user || !ok) {
    // Message unique : distinguer « adresse inconnue » de « mot de passe
    // erroné » livre la moitié de la réponse à qui cherche à entrer.
    return NextResponse.json({ error: "Identifiants incorrects." }, { status: 401 });
  }

  attempts.delete(ip);

  const token = await createSession(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, token, sessionCookie.options());
  return response;
}
