/**
 * Fabrique une image de personnage pour les posts vidéo.
 *
 * POURQUOI UN VISAGE GÉNÉRÉ, ET NON UNE PHOTO
 *
 * Ce visage parlera au nom d'entreprises réelles. Une photo de personne
 * réelle — même achetée sur une banque d'images — pose un problème de droit à
 * l'image dès lors qu'elle semble endosser un commerce : le modèle n'a pas
 * consenti à recommander un plombier lyonnais. Un visage généré n'est celui de
 * personne.
 *
 * `fal-ai/flux/schnell` est retenu pour deux raisons : quelques centimes par
 * image, et un usage commercial explicitement autorisé.
 *
 * POINT DE VIGILANCE POUR LA BIBLIOTHÈQUE DÉFINITIVE
 *
 * Les personnages doivent se distinguer nettement les uns des autres — âge,
 * type, tenue. Deux artisans de la même ville qui publient deux visages
 * presque identiques, et la personnalisation ne trompe plus personne.
 *
 *   npx tsx scripts/generer-personnage.ts --sortie ./personnages/01.png
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SYNCHRONE = "https://fal.run";
const MODELE = "fal-ai/flux/schnell";

/**
 * L'endpoint synchrone, et non la file : une image sort en une à deux
 * secondes. La file ne se justifie que pour la vidéo, qui prend des minutes.
 */
const PROMPT_DEFAUT =
  "professional headshot portrait of a friendly middle-aged european person, " +
  "neutral grey studio background, soft even lighting, facing camera directly, " +
  "warm natural smile, sharp focus on face, photorealistic, high detail";

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const cle = process.env.FAL_KEY;
  if (!cle) {
    console.error("ERREUR : FAL_KEY absente. Renseignez-la dans .env.local.");
    process.exit(1);
  }

  const sortie = argument("sortie") ?? "./personnages/01.png";
  const prompt = argument("prompt") ?? PROMPT_DEFAUT;

  console.log("→ Génération du personnage (fal-ai/flux/schnell)");
  console.log(`   ${prompt.slice(0, 90)}…`);

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

  await mkdir(dirname(sortie), { recursive: true });
  const octets = await fetch(image.url).then((r) => r.arrayBuffer());
  await writeFile(sortie, Buffer.from(octets));

  console.log(`   ${image.width}×${image.height} — enregistrée : ${sortie}`);
}

main().catch((erreur) => {
  console.error("\nÉCHEC :", erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
