import { NextResponse, type NextRequest } from "next/server";
import { getRepo, normalizeEmail } from "@/lib/server/repo";
import { createSession, sessionCookie } from "@/lib/server/session";
import { InvalidBusinessTypeError, resolveTrade } from "@/lib/trades";

/**
 * Inscription.
 *
 * Runtime Node explicite : scrypt vient de `node:crypto`, absent de l'Edge.
 */
export const runtime = "nodejs";

/**
 * Longueur minimale du mot de passe.
 *
 * Douze caractères, sans exigence de majuscule ni de caractère spécial. Ces
 * règles de composition poussent surtout à choisir « Motdepasse1! », qu'un
 * dictionnaire casse en quelques secondes ; la longueur, elle, coûte cher à
 * l'attaquant. La cible est un artisan sur un clavier de téléphone : une phrase
 * de quatre mots vaut mieux qu'une suite de symboles impossible à retaper.
 */
const LONGUEUR_MIN = 12;

/** Validation d'adresse volontairement large : le seul juge est la délivrabilité. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Limitation par adresse IP.
 *
 * Même réserve que sur la connexion : cet état vit en mémoire, donc il
 * disparaît au redémarrage et n'est pas partagé entre instances. Il freine la
 * création massive de comptes depuis une même source, il ne l'empêche pas.
 * La vraie protection devra vivre dans Redis, qui tourne déjà à côté.
 */
const tentatives = new Map<string, { n: number; finFenetre: number }>();
const MAX_PAR_HEURE = 5;
const FENETRE_MS = 60 * 60_000;

function tropDeComptes(ip: string): boolean {
  const maintenant = Date.now();
  const e = tentatives.get(ip);
  if (!e || e.finFenetre < maintenant) {
    tentatives.set(ip, { n: 1, finFenetre: maintenant + FENETRE_MS });
    return false;
  }
  e.n += 1;
  return e.n > MAX_PAR_HEURE;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

  if (tropDeComptes(ip)) {
    return NextResponse.json(
      { error: "Trop de créations de compte depuis cette connexion. Réessayez plus tard." },
      { status: 429 },
    );
  }

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const { email, password, companyName, tradeType, country, phoneNumber } = (corps ?? {}) as {
    email?: unknown;
    password?: unknown;
    companyName?: unknown;
    tradeType?: unknown;
    country?: unknown;
    phoneNumber?: unknown;
  };
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
  }

  const adresse = normalizeEmail(email);
  if (!EMAIL.test(adresse)) {
    return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  }
  if (password.length < LONGUEUR_MIN) {
    return NextResponse.json(
      { error: `Le mot de passe doit faire au moins ${LONGUEUR_MIN} caractères.` },
      { status: 400 },
    );
  }
  // Borne haute : scrypt travaille sur toute la longueur fournie. Sans plafond,
  // un mot de passe d'un mégaoctet occupe le processeur du serveur pendant que
  // les autres requêtes attendent — un déni de service à une ligne.
  if (password.length > 200) {
    return NextResponse.json({ error: "Mot de passe trop long." }, { status: 400 });
  }

  const repo = getRepo();

  if (await repo.findUserByEmail(adresse)) {
    // COMPROMIS ASSUMÉ : cette réponse révèle qu'une adresse est déjà inscrite.
    // L'éviter demanderait de répondre « vérifiez vos e-mails » dans tous les
    // cas — ce qui suppose un envoi d'e-mails, qui n'existe pas encore. Dire
    // « adresse déjà utilisée » à quelqu'un qui vient de la saisir est ce qui
    // lui permet de comprendre et d'aller se connecter. À revoir le jour où
    // l'envoi d'e-mails sera branché.
    return NextResponse.json(
      { error: "Cette adresse est déjà utilisée. Connectez-vous." },
      { status: 409 },
    );
  }

  // Le métier est validé AVANT toute écriture. C'est le seul endroit où cette
  // vérification a du sens : un identifiant hors catalogue enregistré ici
  // contamine tout ce qui suit — le prompt de génération des réponses, les
  // statistiques, la catégorie Google.
  let metierValide: string | null = null;
  if (tradeType != null && tradeType !== "") {
    if (typeof tradeType !== "string") {
      return NextResponse.json({ error: "Métier invalide." }, { status: 400 });
    }
    try {
      metierValide = resolveTrade(tradeType).value;
    } catch (err) {
      if (err instanceof InvalidBusinessTypeError) {
        return NextResponse.json({ error: "Métier inconnu." }, { status: 400 });
      }
      throw err;
    }
  }

  const PAYS = ["CH", "FR", "BE", "LU", "CA", "MC"];
  const paysValide = typeof country === "string" && PAYS.includes(country) ? country : "CH";

  const utilisateur = await repo.createUser(adresse, password);

  // L'entreprise n'est créée que si le formulaire l'a fournie. Une inscription
  // par la seule API reste possible sans elle : l'artisan complétera plus tard.
  if (metierValide && typeof companyName === "string" && companyName.trim()) {
    await repo.createCompany({
      userId: utilisateur.id,
      companyName: companyName.trim().slice(0, 255),
      tradeType: metierValide,
      country: paysValide,
    });
  }

  // Numéro au format E.164 uniquement : c'est ce qu'attend Twilio, et un
  // numéro mal formé ne se découvrirait qu'au premier rapport SMS non délivré.
  if (typeof phoneNumber === "string" && phoneNumber.trim()) {
    const numero = phoneNumber.replace(/[\s.\-()]/g, "");
    if (/^\+[1-9]\d{6,14}$/.test(numero)) {
      await repo.setUserPhone(utilisateur.id, numero);
    }
  }

  // Session ouverte immédiatement : demander de se reconnecter juste après
  // s'être inscrit fait perdre des clients sans rien protéger.
  const jeton = await createSession(utilisateur.id);
  const reponse = NextResponse.json({ ok: true, redirection: "/tableau-de-bord" }, { status: 201 });
  reponse.cookies.set(sessionCookie.name, jeton, sessionCookie.options());
  return reponse;
}
