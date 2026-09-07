import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { createSession, sessionCookie } from "@/lib/server/session";
import { hashMagicToken, evaluerLien, type MagicLinkFailure } from "@/lib/server/magicLink";

/**
 * Consommation d'un lien de connexion sans mot de passe.
 *
 * CE QUI MANQUAIT
 *
 * `magicLinkUrl()` fabriquait `/connexion/lien/{jeton}` depuis le début, et
 * l'e-mail de bienvenue portait ce lien. Aucune route ne répondait à cette
 * adresse : un artisan qui cliquait tombait sur un 404, sans autre moyen
 * d'entrer que de deviner qu'un mot de passe existait.
 *
 * POURQUOI UN POST, ET NON UN SIMPLE CLIC SUR LE LIEN
 *
 * Le jeton ne sert qu'une fois. Or les filtres anti-hameçonnage — Outlook Safe
 * Links, les passerelles d'entreprise — OUVRENT les liens des messages avant
 * leur destinataire, pour les inspecter. Une consommation sur GET serait donc
 * déclenchée par la machine, et l'artisan trouverait un lien « déjà utilisé »
 * sans avoir rien fait.
 *
 * Un robot n'envoie pas de POST. La page d'arrivée montre donc un bouton, et
 * c'est ce bouton qui consomme.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGES: Record<MagicLinkFailure, string> = {
  inconnu: "Ce lien n'est pas valide. Demandez-en un nouveau depuis la page de connexion.",
  expire: "Ce lien a expiré. Demandez-en un nouveau depuis la page de connexion.",
  "deja-utilise": "Ce lien a déjà servi. Demandez-en un nouveau depuis la page de connexion.",
};

export async function POST(request: NextRequest) {
  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }
  const { token } = (corps ?? {}) as { token?: unknown };
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "Jeton manquant." }, { status: 400 });
  }

  /*
   * Le jeton n'est jamais stocké en clair : la base ne contient que son
   * empreinte. Une fuite de la table ne livre donc aucun lien utilisable.
   */
  const empreinte = await hashMagicToken(token);
  const record = await getRepo().consumeMagicLink(empreinte);
  const verdict = evaluerLien(record);

  if (!verdict.ok) {
    /*
     * Le motif exact est affiché — expiré, déjà utilisé, inconnu — parce que
     * l'utilisateur en a besoin pour savoir quoi faire. Ce n'est pas une fuite :
     * il faut déjà détenir un jeton valide en forme pour arriver ici, et les
     * trois cas mènent à la même action.
     */
    return NextResponse.json({ error: MESSAGES[verdict.raison] }, { status: 401 });
  }

  const session = await createSession(verdict.userId);
  const reponse = NextResponse.json({ ok: true });
  reponse.cookies.set(sessionCookie.name, session, sessionCookie.options());
  return reponse;
}
