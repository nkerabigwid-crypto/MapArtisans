// PAS de `import "server-only"` : ce module sera importé par un worker, hors du
// bundler de Next — voir la note détaillée en tête de lib/server/ai/openai.ts.
import OpenAI from "openai";

/**
 * Synthèse vocale — la bande-son des posts vidéo.
 *
 * POURQUOI OPENAI ET PAS UN FOURNISSEUR DÉDIÉ
 *
 * La clé `OPENAI_API_KEY` est déjà configurée et déjà utilisée pour les
 * réponses aux avis et les posts. Ajouter ElevenLabs ou Cartesia signifierait
 * un compte de plus, une clé de plus, une facture de plus et une panne de plus
 * à surveiller — pour une pièce qui coûte un demi-centime par vidéo.
 *
 * L'ORDRE DE GRANDEUR, PARCE QU'IL DÉCIDE DU RESTE
 *
 * `tts-1` est facturé 15 $ le million de caractères. Un script de quinze
 * secondes fait environ 250 caractères, soit 0,004 $ — 0,17 % du coût de la
 * vidéo elle-même (2,25 $ en 720p). La voix ne pèse rien dans l'équation ;
 * c'est l'animation qui coûte. Inutile donc de rogner ici.
 */

/** Le modèle dont le tarif par caractère est le mieux établi. */
const MODELE = "tts-1";

/**
 * Voix par défaut.
 *
 * Neutre à dessein : elle parle au nom d'un artisan, pas au nom de MapArtisans.
 * Une voix trop marquée ferait entendre le prestataire là où le client doit
 * entendre son plombier.
 */
export const VOIX_DEFAUT = "onyx";

let clientCache: OpenAI | null = null;

function client(): OpenAI {
  if (clientCache) return clientCache;
  const cle = process.env.OPENAI_API_KEY;
  if (!cle) {
    throw new Error(
      "OPENAI_API_KEY absente. La synthèse vocale n'a pas de repli : une vidéo " +
        "muette publiée sur la fiche d'un artisan serait pire que pas de vidéo.",
    );
  }
  clientCache = new OpenAI({ apiKey: cle });
  return clientCache;
}

export interface OptionsVoix {
  voix?: string;
  /** Injectable pour les tests : évite d'appeler OpenAI. */
  synthetiser?: (texte: string, voix: string) => Promise<Buffer>;
}

/**
 * Produit le MP3 du script parlé.
 *
 * Renvoie un Buffer et non un fichier : rien n'est écrit sur le disque. Le
 * son part directement dans la requête à fal.ai sous forme de data URI, ce qui
 * évite d'avoir à l'héberger quelque part le temps de l'appel — et évite
 * surtout de laisser traîner la voix d'un client dans un dossier public.
 */
export async function genererVoix(
  texte: string,
  options: OptionsVoix = {},
): Promise<Buffer> {
  const propre = texte.trim();
  if (!propre) {
    throw new Error("Script vide : rien à faire dire au personnage.");
  }

  const voix = options.voix ?? VOIX_DEFAUT;

  if (options.synthetiser) return options.synthetiser(propre, voix);

  const reponse = await client().audio.speech.create({
    model: MODELE,
    voice: voix as never,
    input: propre,
    response_format: "mp3",
  });

  return Buffer.from(await reponse.arrayBuffer());
}

/**
 * Emballe le MP3 en data URI, la forme que `audio_url` accepte chez fal.ai.
 *
 * C'est ce qui permet de tester depuis un poste de développement : fal.ai ne
 * peut évidemment pas aller chercher un fichier sur `localhost`, mais il lit
 * sans difficulté un son qu'on lui envoie dans la requête.
 */
export function enDataUri(mp3: Buffer): string {
  return `data:audio/mpeg;base64,${mp3.toString("base64")}`;
}

/**
 * Estime le coût de la synthèse, en dollars.
 *
 * Exposée parce qu'un coût qu'on ne peut pas afficher est un coût qu'on ne
 * surveille pas. Sert au script de test et, plus tard, au journal du worker.
 */
export function coutVoixUsd(texte: string): number {
  return (texte.trim().length / 1_000_000) * 15;
}
