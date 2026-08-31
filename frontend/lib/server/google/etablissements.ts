/**
 * Lecture des établissements que l'artisan gère sur Google.
 *
 * L'API est scindée en deux services distincts, et c'est le principal piège :
 * la liste des comptes vient de `mybusinessaccountmanagement`, les
 * établissements de `mybusinessbusinessinformation`. Interroger le second sans
 * le premier ne renvoie rien, sans erreur — juste une liste vide.
 */

const URL_COMPTES =
  "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const BASE_ETABLISSEMENTS =
  "https://mybusinessbusinessinformation.googleapis.com/v1";

/**
 * Champs demandés. `readMask` est OBLIGATOIRE sur cette API : sans lui, Google
 * répond 400. On ne demande que ce qui alimente `google_profiles`.
 *
 * `metadata` porte le Place ID, et il est indispensable : le lien de demande
 * d'avis s'écrit `writereview?placeid=ChIJ…`. Sans lui, le SMS envoyé après
 * chaque intervention et le QR code pointent vers une page vide — la
 * fonctionnalité principale du produit, cassée sans erreur visible.
 *
 * L'identifiant de fiche à 19 chiffres affiché dans les paramètres Google
 * (« ID de la fiche d'établissement ») est un TROISIÈME identifiant, réservé
 * au support Google. Il ne fonctionne dans aucun des deux usages ci-dessus.
 */
const CHAMPS = "name,title,storefrontAddress,latlng,metadata";

type Fetch = typeof globalThis.fetch;

export class LectureGoogleEchouee extends Error {
  readonly statut: number;
  constructor(statut: number, detail: string) {
    super(`Google a refusé la lecture (${statut}) : ${detail}`);
    this.name = "LectureGoogleEchouee";
    this.statut = statut;
  }
}

export interface Etablissement {
  /** Identifiant stable, forme `locations/123…`. Clé unique en base. */
  locationId: string;
  /**
   * Place ID, forme `ChIJ…`. Distinct de `locationId` : c'est LUI que Google
   * attend dans un lien d'avis. `null` si Google ne le publie pas encore, ce
   * qui arrive sur une fiche récemment créée et non encore validée.
   */
  placeId: string | null;
  businessName: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

async function lire(
  url: string,
  accessToken: string,
  fetchImpl: Fetch,
): Promise<Record<string, unknown>> {
  const reponse = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new LectureGoogleEchouee(reponse.status, texte.slice(0, 300));
  }
  return JSON.parse(texte) as Record<string, unknown>;
}

interface LocationBrute {
  name?: string;
  title?: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    postalCode?: string;
  };
  latlng?: { latitude?: number; longitude?: number };
  metadata?: { placeId?: string };
}

/** Mise en forme d'une adresse Google en une ligne lisible. */
export function formaterAdresse(
  adresse: LocationBrute["storefrontAddress"],
): string | null {
  if (!adresse) return null;
  const morceaux = [
    ...(adresse.addressLines ?? []),
    [adresse.postalCode, adresse.locality].filter(Boolean).join(" "),
  ].filter((p) => p && p.trim() !== "");
  return morceaux.length > 0 ? morceaux.join(", ") : null;
}

export function normaliserEtablissement(brut: LocationBrute): Etablissement | null {
  // Sans identifiant stable, la fiche ne peut pas être rattachée ni retrouvée.
  if (!brut.name) return null;
  return {
    locationId: brut.name,
    placeId: brut.metadata?.placeId?.trim() || null,
    businessName: brut.title?.trim() || "Établissement sans nom",
    address: formaterAdresse(brut.storefrontAddress),
    city: brut.storefrontAddress?.locality?.trim() || null,
    latitude: brut.latlng?.latitude ?? null,
    longitude: brut.latlng?.longitude ?? null,
  };
}

/**
 * Tous les établissements, tous comptes confondus.
 *
 * Un artisan n'en a le plus souvent qu'un. Une agence en gère des dizaines,
 * répartis sur plusieurs comptes : la pagination n'est donc pas optionnelle.
 */
export async function listerEtablissements(
  accessToken: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<Etablissement[]> {
  const comptes = await lire(URL_COMPTES, accessToken, fetchImpl);
  const listeComptes = Array.isArray(comptes.accounts)
    ? (comptes.accounts as { name?: string }[])
    : [];

  const resultats: Etablissement[] = [];
  for (const compte of listeComptes) {
    if (!compte.name) continue;
    let pageToken: string | undefined;
    do {
      const url = new URL(`${BASE_ETABLISSEMENTS}/${compte.name}/locations`);
      url.searchParams.set("readMask", CHAMPS);
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const page = await lire(url.toString(), accessToken, fetchImpl);
      const brutes = Array.isArray(page.locations)
        ? (page.locations as LocationBrute[])
        : [];
      for (const brute of brutes) {
        const e = normaliserEtablissement(brute);
        if (e) resultats.push(e);
      }
      pageToken =
        typeof page.nextPageToken === "string" && page.nextPageToken !== ""
          ? page.nextPageToken
          : undefined;
    } while (pageToken);
  }
  return resultats;
}
