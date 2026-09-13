/**
 * Fabrique UNE image de personnage, pour essai rapide.
 *
 * POURQUOI UN VISAGE GÉNÉRÉ, ET NON UNE PHOTO
 *
 * Ce visage parlera au nom d'entreprises réelles. Une photo de personne
 * réelle — même achetée sur une banque d'images — pose un problème de droit à
 * l'image dès lors qu'elle semble endosser un commerce : le modèle n'a pas
 * consenti à recommander un plombier lyonnais. Un visage généré n'est celui de
 * personne.
 *
 * Pour construire la bibliothèque complète (tous les métiers, six variantes
 * chacun), voir scripts/generer-bibliotheque.ts — celui-ci ne produit qu'un
 * essai isolé, avant d'engager la dépense complète.
 *
 *   npx tsx scripts/generer-personnage.ts --sortie ./personnages/01.png
 *   npx tsx scripts/generer-personnage.ts --metier taxi --sortie ./personnages/taxi-01.png
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { construirePrompt, genererImagePersonnage } from "../lib/server/video/genererPersonnage";

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
  const metier = argument("metier");
  const varianteArg = argument("variante");
  const variante = varianteArg ? Number(varianteArg) - 1 : undefined;
  const prompt = argument("prompt") ?? construirePrompt(metier, variante);

  console.log("→ Génération du personnage (fal-ai/flux/schnell)");
  console.log(`   ${prompt.slice(0, 90)}…`);

  const image = await genererImagePersonnage(prompt, cle);

  await mkdir(dirname(sortie), { recursive: true });
  await writeFile(sortie, image.octets);

  console.log(`   ${image.largeur}×${image.hauteur} — enregistrée : ${sortie}`);
}

main().catch((erreur) => {
  console.error("\nÉCHEC :", erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
