// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { construireGrille, PAS_KM, type PointGrille } from "./grille";
import { interrogerPoint, type Transport } from "./places";
import type { ScannedPoint } from "./geoGrid";

/**
 * Un relevé complet : les neuf points d'une grille, pour un mot-clé.
 *
 * POURQUOI LES POINTS SONT INTERROGÉS UN PAR UN, ET NON EN PARALLÈLE
 *
 * Neuf requêtes simultanées par mot-clé, multipliées par les mots-clés et les
 * fiches, font un pic que Google traite en 429. Une rafale refusée coûte plus
 * cher qu'une série lente : il faut tout rejouer, et le relevé de la semaine
 * est perdu. La séquence prend une dizaine de secondes ; personne n'attend
 * devant l'écran, c'est un travail de fond.
 */

export interface FicheAScanner {
  placeId: string;
  latitude: number;
  longitude: number;
  pays?: string;
}

export interface ResultatReleve {
  points: ScannedPoint[];
  /** Points que Google a refusé de servir. Un relevé partiel reste utile. */
  echecs: number;
}

const PAUSE_MS = 250;

export async function releverGrille(
  fiche: FicheAScanner,
  motCle: string,
  deps: {
    cle?: string;
    transport?: Transport;
    pasKm?: number;
    /** Injectable pour que les tests n'attendent pas réellement. */
    pause?: (ms: number) => Promise<void>;
  } = {},
): Promise<ResultatReleve> {
  const pasKm = deps.pasKm ?? PAS_KM;
  const grille: PointGrille[] = construireGrille(
    { lat: fiche.latitude, lng: fiche.longitude },
    pasKm,
  );
  const pause = deps.pause ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const points: ScannedPoint[] = [];
  let echecs = 0;

  for (const [index, p] of grille.entries()) {
    try {
      const r = await interrogerPoint(
        {
          motCle,
          lat: p.lat,
          lng: p.lng,
          placeIdArtisan: fiche.placeId,
          pays: fiche.pays,
        },
        { cle: deps.cle, transport: deps.transport, pasKm },
      );
      points.push({
        label: p.label,
        area: p.zone,
        lat: p.lat,
        lng: p.lng,
        position: r.position,
        topCompetitorPlaceId: r.topConcurrentPlaceId,
      });
    } catch {
      /*
       * UN POINT PERDU N'ANNULE PAS LE RELEVÉ.
       *
       * Interrompre à la première erreur ferait qu'un incident réseau passager
       * sur le huitième point efface les sept précédents. La case est
       * enregistrée comme non trouvée — ce qu'elle est, faute de mieux — et
       * `echecs` permet au journal de distinguer « l'artisan n'apparaît pas
       * ici » de « nous n'avons pas réussi à demander ».
       */
      echecs += 1;
      points.push({
        label: p.label,
        area: p.zone,
        lat: p.lat,
        lng: p.lng,
        position: null,
        topCompetitorPlaceId: null,
      });
    }
    if (index < grille.length - 1) await pause(PAUSE_MS);
  }

  return { points, echecs };
}

/**
 * Mot-clé de départ, quand l'artisan n'en a choisi aucun.
 *
 * « plombier Sion » est ce que tape son client — pas « plomberie sanitaire
 * chauffage dépannage », qui est ce qu'un artisan écrit spontanément et que
 * personne ne cherche. Le suivi démarre donc seul, dès le rattachement de la
 * fiche, sans rien demander.
 */
export function motCleParDefaut(metier: string, ville: string | null): string | null {
  const m = metier?.trim();
  const v = ville?.trim();
  if (!m || !v) return null;
  return `${m} ${v}`.toLowerCase();
}
