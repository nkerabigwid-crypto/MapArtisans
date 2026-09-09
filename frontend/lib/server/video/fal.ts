// PAS de `import "server-only"` : importé par un worker hors du bundler Next —
// voir la note détaillée en tête de lib/server/ai/openai.ts.
import { RetryableError, classifyFetchResponse, withBackoff } from "@/lib/server/resilience";

/**
 * Génération des posts vidéo — modèle VEED Fabric 1.0, chez fal.ai.
 *
 * CE QUE LE MODÈLE FAIT, ET SURTOUT CE QU'IL NE FAIT PAS
 *
 * Fabric ne fabrique NI l'image NI la voix. Il prend une image de personnage et
 * une bande-son, et anime le visage pour qu'il prononce le son. Les trois
 * pièces viennent donc d'endroits différents :
 *
 *     l'image  -> bibliothèque de personnages, faite une fois
 *     l'audio  -> lib/server/video/voix.ts (OpenAI), à chaque vidéo
 *     la vidéo -> ici
 *
 * Le portage Python de MapOutreach envoyait `{ prompt, resolution }`. Le modèle
 * exige `image_url`, `audio_url` et `resolution` : cet appel n'aurait jamais
 * abouti. C'est la raison d'être de `construirePayload`, isolée plus bas — le
 * schéma d'entrée appartient au modèle et peut changer, il ne doit se corriger
 * qu'à un seul endroit.
 *
 * POURQUOI LA FILE D'ATTENTE ET NON L'APPEL DIRECT
 *
 * Une génération dure de trente secondes à plusieurs minutes. Un appel HTTP
 * synchrone sur cette durée se fait couper par Caddy, par le pare-feu ou par le
 * client — et la vidéo est facturée sans jamais être récupérée. L'API de file
 * est faite pour ça : on dépose, on reçoit un identifiant, on sonde.
 *
 *     POST https://queue.fal.run/{modele}   -> { request_id, status_url, response_url }
 *     GET  {status_url}                     -> IN_QUEUE | IN_PROGRESS | COMPLETED
 *     GET  {response_url}                   -> la charge utile finale
 */

const BASE_FILE = "https://queue.fal.run";
const MODELE = "veed/fabric-1.0";

/** Intervalle de sondage. Cinq secondes : assez court pour ne pas laisser une
 *  vidéo prête attendre, assez long pour ne pas marteler l'API pendant deux
 *  minutes de génération. */
const INTERVALLE_SONDAGE_MS = 5_000;

/** Plafond absolu. Une génération qui dépasse dix minutes ne reviendra pas, et
 *  un worker qui l'attend indéfiniment cesse de traiter la file entière. */
const DELAI_MAX_MS = 10 * 60_000;

export type Resolution = "720p" | "480p";

/** Tarif fal.ai au 2026-09, en dollars par seconde de vidéo produite. */
const TARIF_USD_PAR_SECONDE: Record<Resolution, number> = {
  "720p": 0.15,
  "480p": 0.08,
};

export class VideoIndisponible extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoIndisponible";
  }
}

function entetes(): Record<string, string> {
  const cle = process.env.FAL_KEY;
  if (!cle) {
    throw new VideoIndisponible(
      "FAL_KEY absente. Aucun repli n'est prévu : un post vidéo annoncé au " +
        "client et jamais publié vaut moins qu'un post texte publié.",
    );
  }
  return { Authorization: `Key ${cle}`, "Content-Type": "application/json" };
}

export interface DemandeVideo {
  /** URL publique ou data URI. En développement, seul le data URI fonctionne :
   *  fal.ai ne peut pas atteindre `localhost`. */
  imageUrl: string;
  audioUrl: string;
  resolution?: Resolution;
}

/**
 * La charge utile envoyée au modèle. LE SEUL ENDROIT À CORRIGER si fal.ai fait
 * évoluer le schéma de `veed/fabric-1.0`.
 */
export function construirePayload(demande: DemandeVideo): Record<string, unknown> {
  return {
    image_url: demande.imageUrl,
    audio_url: demande.audioUrl,
    resolution: demande.resolution ?? "720p",
  };
}

interface Depot {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

async function deposer(demande: DemandeVideo): Promise<Depot> {
  const reponse = await withBackoff(async () => {
    const r = await fetch(`${BASE_FILE}/${MODELE}`, {
      method: "POST",
      headers: entetes(),
      body: JSON.stringify(construirePayload(demande)),
    });
    return classifyFetchResponse(r);
  });

  const corps = (await reponse.json()) as Record<string, unknown>;
  const requestId = corps.request_id;
  const statusUrl = corps.status_url;
  const responseUrl = corps.response_url;

  if (typeof requestId !== "string" || typeof statusUrl !== "string") {
    throw new VideoIndisponible(
      `Dépôt accepté mais réponse inattendue : ${JSON.stringify(corps).slice(0, 300)}`,
    );
  }

  return {
    requestId,
    statusUrl,
    // `response_url` se déduit de `status_url` quand fal.ai ne le renvoie pas.
    responseUrl:
      typeof responseUrl === "string" ? responseUrl : statusUrl.replace(/\/status$/, ""),
  };
}

/**
 * Extrait l'URL du fichier produit.
 *
 * Défensif à dessein : fal.ai renvoie selon les modèles `{ video: { url } }`,
 * `{ video_url }` ou `{ url }`. Une seule de ces formes est documentée
 * aujourd'hui ; les trois ont existé. Mieux vaut les lire toutes que faire
 * échouer une vidéo déjà payée sur une clé renommée.
 */
export function extraireUrl(charge: Record<string, unknown>): string | null {
  const video = charge.video;
  if (video && typeof video === "object" && typeof (video as { url?: unknown }).url === "string") {
    return (video as { url: string }).url;
  }
  for (const cle of ["video_url", "url"] as const) {
    const valeur = charge[cle];
    if (typeof valeur === "string") return valeur;
  }
  return null;
}

export interface OptionsGeneration {
  resolution?: Resolution;
  /** Injectables pour les tests, et pour ne pas dormir cinq secondes en suite unitaire. */
  attendre?: (ms: number) => Promise<void>;
  maintenant?: () => number;
  /** Appelé à chaque sondage — sert au journal du worker et au script de test. */
  surProgression?: (statut: string, ecouleMs: number) => void;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Dépose la demande, sonde jusqu'à complétion, renvoie l'URL de la vidéo.
 */
export async function genererVideo(
  demande: DemandeVideo,
  options: OptionsGeneration = {},
): Promise<string> {
  const attendre = options.attendre ?? dormir;
  const maintenant = options.maintenant ?? (() => Date.now());

  const depot = await deposer({ ...demande, resolution: options.resolution ?? demande.resolution });
  const depart = maintenant();

  for (;;) {
    const ecoule = maintenant() - depart;
    if (ecoule > DELAI_MAX_MS) {
      throw new VideoIndisponible(
        `Génération ${depot.requestId} toujours en cours après ${Math.round(ecoule / 1000)} s. ` +
          "Abandon : la file doit continuer d'avancer.",
      );
    }

    const r = await withBackoff(async () => {
      const brut = await fetch(depot.statusUrl, { headers: entetes() });
      return classifyFetchResponse(brut);
    });
    const etat = (await r.json()) as Record<string, unknown>;
    const statut = typeof etat.status === "string" ? etat.status : "INCONNU";

    options.surProgression?.(statut, ecoule);

    if (statut === "COMPLETED") break;
    if (statut !== "IN_QUEUE" && statut !== "IN_PROGRESS") {
      throw new VideoIndisponible(
        `Statut inattendu « ${statut} » : ${JSON.stringify(etat).slice(0, 300)}`,
      );
    }

    await attendre(INTERVALLE_SONDAGE_MS);
  }

  const finale = await withBackoff(async () => {
    const brut = await fetch(depot.responseUrl, { headers: entetes() });
    return classifyFetchResponse(brut);
  });
  const charge = (await finale.json()) as Record<string, unknown>;

  const url = extraireUrl(charge);
  if (!url) {
    // La vidéo est facturée : le corps complet part au journal, sinon on paie
    // sans savoir pourquoi on n'a rien reçu.
    throw new VideoIndisponible(
      `Génération terminée mais aucune URL trouvée : ${JSON.stringify(charge).slice(0, 500)}`,
    );
  }
  return url;
}

/** Coût estimé d'une vidéo, en dollars. */
export function coutVideoUsd(secondes: number, resolution: Resolution = "720p"): number {
  return secondes * TARIF_USD_PAR_SECONDE[resolution];
}

/** Exposé pour que `RetryableError` reste rattaché à ce module côté appelants. */
export { RetryableError };
