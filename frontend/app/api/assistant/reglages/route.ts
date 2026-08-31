import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { normaliserOrigine } from "@/lib/server/assistant/access";

export const runtime = "nodejs";

/**
 * Réglages de l'assistant, côté artisan.
 *
 * C'EST ICI QUE LA CLÉ DE WIDGET SE LIT
 *
 * Elle est créée au rattachement de la fiche Google et n'est affichée qu'au
 * propriétaire. La clé est publique par destination — elle vivra dans le HTML
 * d'un site — mais la donner à un tiers reviendrait à lui laisser consommer le
 * budget OpenAI de l'artisan tant qu'il déclare la bonne origine.
 *
 * Le filtre de propriété est dans la requête SQL, jamais ici : c'est la seule
 * façon qu'aucune route ne puisse l'oublier.
 */

/** Au-delà, ce n'est plus un artisan qui déclare ses sites. */
const ORIGINES_MAX = 10;

/** Taille de la base de connaissances saisie par l'artisan. */
const FAQ_MAX = 4000;

async function ficheDeLaRequete(request: NextRequest) {
  const session = await verifySession(request.cookies.get(sessionCookie.name)?.value);
  if (!session) return { erreur: NextResponse.json({ error: "Connectez-vous d'abord." }, { status: 401 }) };

  const profileId = request.nextUrl.searchParams.get("ficheId");
  if (!profileId) {
    return { erreur: NextResponse.json({ error: "Fiche non précisée." }, { status: 400 }) };
  }
  return { userId: session.uid, profileId };
}

export async function GET(request: NextRequest) {
  const ctx = await ficheDeLaRequete(request);
  if ("erreur" in ctx) return ctx.erreur;

  const repo = getRepo();
  const reglages = await repo.findAssistantSettingsForUser(ctx.userId, ctx.profileId);
  if (!reglages) {
    // Même réponse qu'une fiche appartenant à un autre : ne pas distinguer
    // « inexistante » de « pas la vôtre » évite d'énumérer les fiches.
    return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
  }

  return NextResponse.json({
    widgetKey: reglages.widgetKey,
    allowedOrigins: reglages.allowedOrigins,
    faqContext: reglages.faqContext,
    isActive: reglages.isActive,
    dailyMessageLimit: reglages.dailyMessageLimit,
  });
}

export async function PATCH(request: NextRequest) {
  const ctx = await ficheDeLaRequete(request);
  if ("erreur" in ctx) return ctx.erreur;

  const repo = getRepo();
  const reglages = await repo.findAssistantSettingsForUser(ctx.userId, ctx.profileId);
  if (!reglages) {
    return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
  }

  let corps: { allowedOrigins?: unknown; faqContext?: unknown; isActive?: unknown };
  try {
    corps = (await request.json()) as typeof corps;
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const maj: {
    profileId: string;
    allowedOrigins?: string[];
    faqContext?: string | null;
    isActive?: boolean;
  } = { profileId: ctx.profileId };

  if (corps.allowedOrigins !== undefined) {
    if (!Array.isArray(corps.allowedOrigins)) {
      return NextResponse.json({ error: "Domaines invalides." }, { status: 400 });
    }
    if (corps.allowedOrigins.length > ORIGINES_MAX) {
      return NextResponse.json(
        { error: `Au maximum ${ORIGINES_MAX} domaines.` },
        { status: 400 },
      );
    }
    /*
     * Normalisées à l'écriture, comme à la lecture. Sans cela, un artisan qui
     * saisit « https://mon-site.ch/ » ne correspondrait jamais à l'en-tête
     * `Origin` envoyé par son propre site, et l'assistant refuserait tout sans
     * qu'il comprenne pourquoi.
     */
    const propres: string[] = [];
    for (const brut of corps.allowedOrigins) {
      if (typeof brut !== "string") continue;
      const hote = normaliserOrigine(brut) ?? normaliserOrigine(`https://${brut.trim()}`);
      if (!hote) {
        return NextResponse.json(
          { error: `Domaine illisible : ${String(brut).slice(0, 60)}` },
          { status: 400 },
        );
      }
      if (!propres.includes(hote)) propres.push(hote);
    }
    maj.allowedOrigins = propres;
  }

  if (corps.faqContext !== undefined) {
    if (corps.faqContext !== null && typeof corps.faqContext !== "string") {
      return NextResponse.json({ error: "Contexte invalide." }, { status: 400 });
    }
    maj.faqContext =
      typeof corps.faqContext === "string" ? corps.faqContext.slice(0, FAQ_MAX) : null;
  }

  if (corps.isActive !== undefined) {
    if (typeof corps.isActive !== "boolean") {
      return NextResponse.json({ error: "Activation invalide." }, { status: 400 });
    }
    // Activer sans domaine déclaré donnerait un assistant qui refuse tout :
    // mieux vaut le dire que laisser l'artisan chercher.
    const domaines = maj.allowedOrigins ?? reglages.allowedOrigins;
    if (corps.isActive && domaines.length === 0) {
      return NextResponse.json(
        { error: "Déclarez d'abord le domaine de votre site." },
        { status: 400 },
      );
    }
    maj.isActive = corps.isActive;
  }

  await repo.majReglagesAssistant(maj);
  const apres = await repo.findAssistantSettingsForUser(ctx.userId, ctx.profileId);
  return NextResponse.json({
    widgetKey: apres!.widgetKey,
    allowedOrigins: apres!.allowedOrigins,
    faqContext: apres!.faqContext,
    isActive: apres!.isActive,
  });
}
