import { NextResponse, type NextRequest } from "next/server";
import { getRepo, normalizeEmail } from "@/lib/server/repo";
import { envoyerBienvenue } from "@/lib/server/email/bienvenue";

/**
 * Envoi d'un lien de connexion à la demande.
 *
 * CE QUI MANQUAIT
 *
 * Un lien était créé à l'inscription et au paiement, puis jamais. Il vaut
 * quinze minutes. Un artisan qui ouvre son courrier le lendemain — ce qui est
 * la norme quand on passe la journée sur un chantier — n'avait plus que le
 * mot de passe qu'on lui avait promis de ne pas retenir.
 *
 * LA RÉPONSE EST TOUJOURS LA MÊME
 *
 * Adresse connue ou non, la réponse est un 200 au texte identique. Répondre
 * « ce compte n'existe pas » transformerait ce formulaire en outil de
 * vérification : on saurait, une adresse à la fois, qui est client de
 * MapArtisans. C'est une fuite au sens du RGPD, et le renseignement se revend.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Limitation par adresse IP.
 *
 * Sans elle, ce formulaire enverrait autant de courriers qu'on le lui demande,
 * à n'importe quelle adresse : de quoi faire d'un artisan la cible d'un
 * harcèlement, et de notre domaine un expéditeur signalé.
 *
 * Cet état vit en mémoire, donc il disparaît au redémarrage et n'est pas
 * partagé entre instances. Il freine, il n'empêche pas. La vraie protection
 * devra vivre dans Redis, qui tourne déjà à côté.
 */
const tentatives = new Map<string, { n: number; finFenetre: number }>();
const MAX_PAR_HEURE = 5;
const FENETRE_MS = 60 * 60_000;

function tropDeDemandes(ip: string): boolean {
  const maintenant = Date.now();
  const e = tentatives.get(ip);
  if (!e || e.finFenetre < maintenant) {
    tentatives.set(ip, { n: 1, finFenetre: maintenant + FENETRE_MS });
    return false;
  }
  e.n += 1;
  return e.n > MAX_PAR_HEURE;
}

/** Un seul texte, quel que soit le sort réel de la demande. */
const REPONSE = {
  message:
    "Si un compte existe pour cette adresse, un lien de connexion vient d'y être envoyé. " +
    "Il est valable quinze minutes.",
};

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (tropDeDemandes(ip)) {
    return NextResponse.json(
      { error: "Trop de demandes depuis cette connexion. Réessayez dans une heure." },
      { status: 429 },
    );
  }

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }
  const { email } = (corps ?? {}) as { email?: unknown };
  if (typeof email !== "string" || !EMAIL.test(email)) {
    return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  }

  const adresse = normalizeEmail(email);
  const repo = getRepo();
  const utilisateur = await repo.findUserByEmail(adresse);

  if (utilisateur) {
    /*
     * `envoyerBienvenue` ne lève jamais : un fournisseur indisponible est
     * journalisé, pas propagé. Le demandeur reçoit la même réponse dans tous
     * les cas — sinon la durée de la requête trahirait l'existence du compte.
     */
    await envoyerBienvenue({ userId: utilisateur.id, email: utilisateur.email }, { repo });
  }

  return NextResponse.json(REPONSE);
}
