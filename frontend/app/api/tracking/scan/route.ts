import { NextResponse, type NextRequest } from "next/server";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { getRepo } from "@/lib/server/repo";
import {
  classifyScan,
  summarizeScan,
  type ScannedPoint,
} from "@/lib/server/tracking/geoGrid";

export const runtime = "nodejs";

/**
 * Reçoit les points relevés lors d'un scan Geo-Grid et renvoie leur
 * classification (vert/ambre/rouge) — voir lib/server/tracking/geoGrid.ts pour
 * la règle elle-même.
 *
 * En amont, un worker planifié appellera l'API Places de Google (Text Search,
 * SKU IDs Only — gratuit, voir §10 du cahier des charges) pour produire ces
 * points, puis POSTera ici ; cette route ne fait pas l'appel Google elle-même,
 * elle applique la règle métier et vérifie les droits.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession(request.cookies.get(sessionCookie.name)?.value);
  if (!session) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const { profileId, keyword, points } = (body ?? {}) as {
    profileId?: unknown;
    keyword?: unknown;
    points?: unknown;
  };

  if (typeof profileId !== "string" || typeof keyword !== "string" || !Array.isArray(points)) {
    return NextResponse.json({ error: "Champs manquants ou invalides." }, { status: 400 });
  }

  const parsedPoints = parsePoints(points);
  if (!parsedPoints) {
    return NextResponse.json({ error: "Format de point invalide." }, { status: 400 });
  }

  // Le filtre par propriétaire fait partie de la lecture elle-même (voir
  // repo.ts) : un artisan ne peut pas soumettre un scan pour la fiche d'un
  // autre, même en devinant son identifiant.
  const repo = getRepo();
  const profile = await repo.findProfileForUser(session.uid, profileId);
  if (!profile) {
    return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
  }

  const classified = classifyScan(parsedPoints);
  const summary = summarizeScan(classified);

  // TODO(persistance) : écrire dans rank_trackings.grid_points une fois Prisma
  // branché sur une base réelle — voir migration 003. Le dépôt en mémoire
  // (repo.ts) ne porte pas encore les scans, volontairement : ajouter une
  // méthode d'écriture sans base réelle pour la recevoir aurait été un
  // simulacre, pas une implémentation.

  return NextResponse.json({ profileId, keyword, points: classified, summary });
}

function parsePoints(raw: unknown[]): ScannedPoint[] | null {
  const out: ScannedPoint[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const p = item as Record<string, unknown>;
    if (
      typeof p.label !== "string" ||
      typeof p.area !== "string" ||
      typeof p.lat !== "number" ||
      typeof p.lng !== "number" ||
      (p.position !== null && typeof p.position !== "number") ||
      (p.topCompetitorPlaceId !== null && typeof p.topCompetitorPlaceId !== "string")
    ) {
      return null;
    }
    out.push({
      label: p.label,
      area: p.area,
      lat: p.lat,
      lng: p.lng,
      position: p.position as number | null,
      topCompetitorPlaceId: p.topCompetitorPlaceId as string | null,
    });
  }
  return out;
}
