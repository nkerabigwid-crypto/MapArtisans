import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { openAiPostGenerator, SUJETS, type SujetPost } from "@/lib/server/ai/posts";
import { resolveTradeOrDefault } from "@/lib/trades";
import type { PlanId } from "@/lib/data";

export const runtime = "nodejs";

/**
 * Génération des publications Google.
 *
 * RÉSERVÉ AU PALIER PROFESSIONNEL
 *
 * Le contrôle est ici, côté serveur, et pas seulement dans l'affichage : une
 * fonctionnalité facturée qui se déclenche depuis la console d'un navigateur
 * n'est pas facturée du tout.
 *
 * Le brouillon est enregistré, JAMAIS publié. La publication sur Google exige
 * l'API Business Profile, dont l'accès n'est pas accordé — et même une fois
 * accordé, un texte généré ne doit pas partir sur la fiche d'un artisan sans
 * qu'il l'ait relu.
 */

const PALIERS_AUTORISES: PlanId[] = ["professionnel"];

/** Précisions libres de l'artisan. Court : c'est un aide-mémoire, pas un brief. */
const PRECISIONS_MAX = 300;

/**
 * Publications générées par jour et par fiche.
 *
 * Un bouton « Régénérer » cliqué en boucle appelle OpenAI à chaque fois. Le
 * coût unitaire est dérisoire, la boucle ne l'est pas.
 */
const MAX_PAR_JOUR = 20;

async function contexte(request: NextRequest) {
  const session = await verifySession(request.cookies.get(sessionCookie.name)?.value);
  if (!session) {
    return { erreur: NextResponse.json({ error: "Connectez-vous d'abord." }, { status: 401 }) };
  }
  return { userId: session.uid };
}

export async function POST(request: NextRequest) {
  const ctx = await contexte(request);
  if ("erreur" in ctx) return ctx.erreur;

  let corps: { ficheId?: unknown; sujet?: unknown; precisions?: unknown; postId?: unknown };
  try {
    corps = (await request.json()) as typeof corps;
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const { ficheId, sujet } = corps;
  if (typeof ficheId !== "string") {
    return NextResponse.json({ error: "Fiche non précisée." }, { status: 400 });
  }
  if (typeof sujet !== "string" || !SUJETS.some((s) => s.tag === sujet)) {
    return NextResponse.json({ error: "Sujet inconnu." }, { status: 400 });
  }

  const repo = getRepo();
  // Le filtre de propriété est dans la requête : un artisan ne génère jamais
  // pour la fiche d'un autre.
  const fiche = await repo.findProfileForUser(ctx.userId, ficheId);
  if (!fiche) {
    return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
  }

  const entreprise = await repo.getCompanyForProfile(fiche.id);
  const plan = (entreprise?.planId ?? "basique") as PlanId;
  if (!PALIERS_AUTORISES.includes(plan)) {
    return NextResponse.json(
      { error: "Les publications sont incluses dans le palier Professionnel." },
      { status: 403 },
    );
  }

  const dejaAujourdhui = await repo.listerPosts(fiche.id, MAX_PAR_JOUR + 1);
  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);
  if (dejaAujourdhui.filter((p) => p.createdAt >= debutJour).length >= MAX_PAR_JOUR) {
    return NextResponse.json(
      { error: "Vous avez atteint la limite de publications générées aujourd'hui." },
      { status: 429 },
    );
  }

  const precisions =
    typeof corps.precisions === "string" ? corps.precisions.slice(0, PRECISIONS_MAX) : null;

  try {
    const texte = await openAiPostGenerator.generate({
      businessName: fiche.businessName,
      city: fiche.city,
      tradeType: resolveTradeOrDefault(entreprise?.tradeType ?? "").value,
      sujet: sujet as SujetPost,
      precisions,
    });

    // Régénération d'un brouillon existant : on remplace le texte au lieu d'en
    // empiler un nouveau, sinon la liste se remplit d'essais abandonnés.
    if (typeof corps.postId === "string" && corps.postId) {
      await repo.majPost({ postId: corps.postId, profileId: fiche.id, content: texte });
      return NextResponse.json({ id: corps.postId, content: texte });
    }

    const post = await repo.creerPost({
      profileId: fiche.id,
      content: texte,
      topicTag: sujet,
      // Proposition par défaut : demain, même heure. L'artisan choisira ; rien
      // ne part sans lui.
      scheduledAt: new Date(Date.now() + 24 * 3600 * 1000),
    });
    return NextResponse.json({ id: post.id, content: post.content, status: post.status });
  } catch (err) {
    console.error("[posts] génération échouée :", err);
    return NextResponse.json(
      { error: "La génération a échoué. Réessayez dans un instant." },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest) {
  const ctx = await contexte(request);
  if ("erreur" in ctx) return ctx.erreur;

  const ficheId = request.nextUrl.searchParams.get("ficheId");
  if (!ficheId) {
    return NextResponse.json({ error: "Fiche non précisée." }, { status: 400 });
  }

  const repo = getRepo();
  const fiche = await repo.findProfileForUser(ctx.userId, ficheId);
  if (!fiche) return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });

  const posts = await repo.listerPosts(fiche.id);
  return NextResponse.json({
    sujets: SUJETS,
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      topicTag: p.topicTag,
      status: p.status,
      scheduledAt: p.scheduledAt,
    })),
  });
}
