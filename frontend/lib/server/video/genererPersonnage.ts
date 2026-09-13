// PAS de `import "server-only"` : appelé par des scripts hors du bundler Next.

import { TENUE_PAR_METIER, VARIANTES_PERSONNE } from "./tenues";

/**
 * Fabrique l'image d'un personnage — logique partagée entre le script
 * d'essai unitaire (generer-personnage.ts) et la construction de la
 * bibliothèque complète (generer-bibliotheque.ts). Voir la note de
 * tenues.ts pour pourquoi le visage est généré et non photographié.
 */

const SYNCHRONE = "https://fal.run";
const MODELE = "fal-ai/flux/schnell";

const BASE =
  "professional headshot portrait of a friendly {PERSONNE}, {TENUE}, " +
  "neutral grey studio background, soft even lighting, facing camera directly, " +
  "warm natural smile, sharp focus on face, photorealistic, high detail";

export class MetierInconnuPourPersonnage extends Error {
  constructor(metier: string) {
    super(`Métier inconnu : « ${metier} ». Valeurs acceptées : ${Object.keys(TENUE_PAR_METIER).join(", ")}.`);
    this.name = "MetierInconnuPourPersonnage";
  }
}

/**
 * `variante` indexe VARIANTES_PERSONNE (0 à 5) pour que les six personnages
 * d'un même métier se distinguent réellement — voir la note de tenues.ts.
 * Absente, elle retombe sur un descriptif neutre plutôt que d'échouer : le
 * script d'essai unitaire n'a besoin de générer qu'UN personnage, pas six.
 */
export function construirePrompt(metier: string | undefined, variante?: number): string {
  const tenue = metier ? TENUE_PAR_METIER[metier] : undefined;
  if (metier && !tenue) throw new MetierInconnuPourPersonnage(metier);

  const personne =
    variante !== undefined ? VARIANTES_PERSONNE[variante % VARIANTES_PERSONNE.length] : "middle-aged european person";

  return BASE.replace("{PERSONNE}", personne).replace("{TENUE}", tenue ?? "wearing a simple crew-neck sweater");
}

export interface ImageGeneree {
  octets: Buffer;
  largeur?: number;
  hauteur?: number;
}

/** Un appel fal-ai/flux/schnell, quelques centimes. Aucun budget vérifié ici
 *  — c'est aux appelants (scripts) de chiffrer et de faire confirmer avant. */
export async function genererImagePersonnage(prompt: string, cle: string): Promise<ImageGeneree> {
  const reponse = await fetch(`${SYNCHRONE}/${MODELE}`, {
    method: "POST",
    headers: { Authorization: `Key ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      // Portrait : Fabric anime un visage, le cadrage vertical le sert.
      image_size: "portrait_4_3",
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: true,
    }),
  });

  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => "");
    throw new Error(`fal.ai a répondu ${reponse.status} : ${corps.slice(0, 400)}`);
  }

  const charge = (await reponse.json()) as {
    images?: Array<{ url?: string; width?: number; height?: number }>;
  };
  const image = charge.images?.[0];
  if (!image?.url) {
    throw new Error(`Aucune image renvoyée : ${JSON.stringify(charge).slice(0, 400)}`);
  }

  const brut: ArrayBuffer = await fetch(image.url).then((r) => r.arrayBuffer());
  const octets = Buffer.from(new Uint8Array(brut));
  return { octets, largeur: image.width, hauteur: image.height };
}
