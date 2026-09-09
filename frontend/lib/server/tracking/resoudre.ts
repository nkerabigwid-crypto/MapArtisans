// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { ConfigurationPlacesAbsente, type Transport } from "./places";

/**
 * Retrouve un établissement par son nom et sa ville.
 *
 * CE QUE CETTE FONCTION DÉBLOQUE
 *
 * `releverGrille` n'a besoin que de quatre choses : un place_id, des
 * coordonnées, et le pays. Jusqu'ici toutes venaient du rattachement OAuth de
 * la fiche Google — donc de l'API Business Profile, dont l'accès n'est pas
 * accordé. Le suivi de position était par conséquent inatteignable, alors même
 * que Places API, elle, fonctionne.
 *
 * Or Places API sait faire ce travail seule : chercher « Dupont Plomberie
 * Genève » renvoie l'identifiant et la position de l'établissement, sans
 * aucune autorisation du propriétaire. C'est de la donnée publique — la même
 * que voit n'importe qui sur Maps.
 *
 * Conséquence directe : une Geo-Grid RÉELLE peut être calculée pour n'importe
 * quel artisan, avant qu'il ne soit client, et sans attendre Google.
 *
 * POURQUOI CET APPEL COÛTE PLUS CHER QUE LES AUTRES
 *
 * Le relevé de grille demande `places.id` seul, ce qui le place dans le palier
 * « Text Search (IDs Only) », facturé zéro. Ici il faut AUSSI la position,
 * ce qui bascule sur un palier payant.
 *
 * L'écart est acceptable parce qu'il ne se paie qu'UNE FOIS par audit, contre
 * neuf appels gratuits pour la grille elle-même. Mais il est réel : cette
 * fonction ne doit jamais être appelée dans une boucle, ni à chaque relevé
 * d'un client déjà résolu. On résout une fois, on conserve.
 */

const URL_RECHERCHE = "https://places.googleapis.com/v1/places:searchText";

export interface EtablissementResolu {
  placeId: string;
  nom: string;
  adresse: string | null;
  latitude: number;
  longitude: number;
}

export class EtablissementIntrouvable extends Error {
  constructor(requete: string) {
    super(
      `Aucun établissement trouvé pour « ${requete} ». Vérifiez l'orthographe ` +
        "du nom et la ville, ou que la fiche est bien publiée sur Google.",
    );
    this.name = "EtablissementIntrouvable";
  }
}

export async function resoudreEtablissement(
  input: { nom: string; ville: string; pays?: string },
  deps: { cle?: string; transport?: Transport } = {},
): Promise<EtablissementResolu> {
  const cle = deps.cle ?? process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!cle) throw new ConfigurationPlacesAbsente();
  const transport = deps.transport ?? (fetch as unknown as Transport);

  const requete = `${input.nom.trim()} ${input.ville.trim()}`.trim();
  if (!requete) throw new EtablissementIntrouvable("(requête vide)");

  const reponse = await transport(URL_RECHERCHE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": cle,
      // Le strict nécessaire. Chaque champ demandé peut changer de palier de
      // facturation : `displayName` et `location` suffisent, et on ne demande
      // ni les horaires, ni les photos, ni les avis.
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: requete,
      // Un seul résultat : on cherche UN établissement précis, pas une liste.
      // Demander davantage coûterait sans rien apporter — si le premier
      // résultat n'est pas le bon, c'est la requête qu'il faut corriger.
      maxResultCount: 1,
      languageCode: "fr",
      regionCode: input.pays ?? "CH",
    }),
  });

  if (!reponse.ok) {
    throw new Error(`Places a refusé la requête (${reponse.status}).`);
  }

  const corps = (await reponse.json()) as {
    places?: {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }[];
  };

  // `places` est ABSENT quand rien ne correspond, et non un tableau vide —
  // même comportement que pour le relevé de grille.
  const trouve = corps.places?.[0];
  if (!trouve?.id || typeof trouve.location?.latitude !== "number") {
    throw new EtablissementIntrouvable(requete);
  }

  return {
    placeId: trouve.id,
    nom: trouve.displayName?.text ?? input.nom.trim(),
    adresse: trouve.formattedAddress ?? null,
    latitude: trouve.location.latitude,
    longitude: trouve.location.longitude as number,
  };
}
