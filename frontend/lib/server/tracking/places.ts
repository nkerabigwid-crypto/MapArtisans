// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { rayonMetres } from "./grille";

/**
 * Interrogation de l'API Places pour un point de la grille.
 *
 * POURQUOI CE MASQUE DE CHAMPS, ET LUI SEUL
 *
 * `X-Goog-FieldMask: places.id` place l'appel dans le palier « Text Search
 * (IDs Only) », facturé zéro par Google. Demander ne serait-ce que
 * `places.displayName` bascule dans le palier Essentials, facturé à chaque
 * requête — soit 9 points × 5 mots-clés × 52 semaines × le nombre de clients.
 *
 * Ce n'est pas qu'une question de coût. Les conditions de la Google Maps
 * Platform interdisent de conserver les noms, notes et avis ; seul le place_id
 * échappe à la restriction de mise en cache. Ne demander que l'identifiant est
 * donc aussi ce qui nous permet d'enregistrer le relevé sans être en faute.
 */

const URL_RECHERCHE = "https://places.googleapis.com/v1/places:searchText";

export class ConfigurationPlacesAbsente extends Error {
  constructor() {
    super(
      "GOOGLE_PLACES_API_KEY n'est pas défini. Le relevé de position est " +
        "indisponible tant que la clé n'est pas configurée.",
    );
    this.name = "ConfigurationPlacesAbsente";
  }
}

/** Injectable : les tests fournissent leur propre transport. */
export type Transport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface ResultatPoint {
  /** Rang de la fiche pour ce point. `null` = absente des résultats. */
  position: number | null;
  /** place_id du premier classé, `null` quand c'est l'artisan lui-même. */
  topConcurrentPlaceId: string | null;
}

/**
 * Extrait la position depuis une réponse Places.
 *
 * Fonction pure et exportée : c'est la seule logique qui puisse se tromper
 * silencieusement — un décalage d'un rang ne lève aucune erreur et fausse tous
 * les relevés. Elle se teste donc sans réseau.
 */
export function lirePosition(ids: string[], placeIdArtisan: string): ResultatPoint {
  const index = ids.indexOf(placeIdArtisan);
  return {
    // +1 : Google classe à partir de 1, les tableaux à partir de 0. C'est
    // exactement là que se logent les erreurs de rang.
    position: index === -1 ? null : index + 1,
    topConcurrentPlaceId:
      ids.length === 0 || ids[0] === placeIdArtisan ? null : ids[0],
  };
}

export async function interrogerPoint(
  input: {
    motCle: string;
    lat: number;
    lng: number;
    placeIdArtisan: string;
    /** Oriente les résultats — « CH » pour la Suisse. */
    pays?: string;
  },
  deps: { cle?: string; transport?: Transport; pasKm?: number } = {},
): Promise<ResultatPoint> {
  const cle = deps.cle ?? process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!cle) throw new ConfigurationPlacesAbsente();
  const transport = deps.transport ?? (fetch as unknown as Transport);

  const reponse = await transport(URL_RECHERCHE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": cle,
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({
      textQuery: input.motCle,
      // `locationBias` et non `locationRestriction` : on veut savoir ce que
      // Google montre à quelqu'un QUI SE TROUVE là, pas filtrer sur une zone.
      // Un restaurant à 200 m de la limite reste un concurrent réel.
      locationBias: {
        circle: {
          center: { latitude: input.lat, longitude: input.lng },
          radius: rayonMetres(deps.pasKm),
        },
      },
      // Au-delà de 10, la fiche n'est plus vue : demander davantage
      // coûterait des appels pour une information sans valeur métier.
      maxResultCount: 10,
      languageCode: "fr",
      regionCode: input.pays ?? "CH",
    }),
  });

  if (!reponse.ok) {
    throw new Error(`Places a refusé la requête (${reponse.status}).`);
  }

  const corps = (await reponse.json()) as { places?: { id?: string }[] };
  // `places` est ABSENT quand rien ne correspond — et non un tableau vide.
  // Traiter l'absence comme une erreur ferait échouer un relevé parfaitement
  // valide : « personne ne ressort ici » est une information, pas une panne.
  const ids = (corps.places ?? []).map((p) => p.id).filter((v): v is string => !!v);
  return lirePosition(ids, input.placeIdArtisan);
}
