/**
 * Épreuve de vérité du post vidéo : une génération RÉELLE, de bout en bout.
 *
 * POURQUOI CE SCRIPT EXISTE
 *
 * Deux questions bloquent toute la fonction, et aucune ne se tranche par le
 * raisonnement :
 *
 *   1. La charge utile passe-t-elle ? Le portage Python envoyait un `prompt`
 *      là où le modèle exige `image_url` + `audio_url` — il n'aurait jamais
 *      abouti, et personne ne s'en était aperçu faute d'appel réel.
 *   2. Le résultat est-il publiable sur la fiche d'un artisan ? Personne ne
 *      peut répondre à ça sans regarder la vidéo.
 *
 * RIEN N'EST FACTURÉ SANS `--payant`
 *
 * Sans ce drapeau, le script vérifie la configuration, calcule le coût et
 * s'arrête. C'est la même précaution que `test_pipeline.py` chez MapOutreach :
 * un script de test qu'on lance distraitement ne doit pas coûter d'argent.
 *
 *   npx tsx scripts/tester-video.ts --image <chemin|url>
 *   npx tsx scripts/tester-video.ts --image <chemin|url> --payant
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";

import { coutVideoUsd, genererVideo, type Resolution } from "../lib/server/video/fal";
import { coutVoixUsd, enDataUri, genererVoix } from "../lib/server/video/voix";

const SCRIPT_DEFAUT =
  "Chez Dupont Plomberie, on intervient à Lyon sept jours sur sept. " +
  "Fuite, chauffe-eau, urgence : un seul numéro, et quelqu'un se déplace.";

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Une image locale part en data URI, une URL passe telle quelle.
 *
 * En développement, le data URI n'est pas un confort mais une nécessité :
 * fal.ai ne peut évidemment pas aller chercher un fichier sur `localhost`.
 */
async function versUrlImage(source: string): Promise<string> {
  if (/^https?:\/\//.test(source)) return source;
  if (!existsSync(source)) {
    throw new Error(`Image introuvable : ${source}`);
  }
  const octets = await readFile(source);
  const type = extname(source).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  return `data:${type};base64,${octets.toString("base64")}`;
}

async function main(): Promise<void> {
  const payant = process.argv.includes("--payant");
  const image = argument("image");
  const texte = argument("texte") ?? SCRIPT_DEFAUT;
  const resolution = (argument("resolution") ?? "720p") as Resolution;

  console.log("→ Configuration");
  for (const [nom, presente] of [
    ["OPENAI_API_KEY", Boolean(process.env.OPENAI_API_KEY)],
    ["FAL_KEY", Boolean(process.env.FAL_KEY)],
  ] as const) {
    console.log(`   ${nom.padEnd(16)} ${presente ? "définie" : "ABSENTE"}`);
    if (!presente) {
      console.error(`\nERREUR : ${nom} manque. Renseignez-la dans .env.local.`);
      process.exit(1);
    }
  }

  if (!image) {
    console.error(
      "\nERREUR : --image est obligatoire.\n" +
        "  Fabric anime un VISAGE existant : il lui faut une image de personnage.\n" +
        "  Pour ce premier essai, n'importe quel portrait fait l'affaire.\n\n" +
        "  npx tsx scripts/tester-video.ts --image ./personnage.png --payant",
    );
    process.exit(1);
  }

  // Estimation avant tout appel : on doit savoir ce qu'on s'apprête à dépenser.
  const secondes = Math.max(5, Math.round(texte.length / 15));
  const estimation = coutVideoUsd(secondes, resolution) + coutVoixUsd(texte);
  console.log("\n→ Estimation");
  console.log(`   script            ${texte.length} caractères (~${secondes} s)`);
  console.log(`   résolution        ${resolution}`);
  console.log(`   coût estimé       ${estimation.toFixed(3)} $`);

  if (!payant) {
    console.log(
      "\n→ Arrêt : aucun appel facturé n'a été fait.\n" +
        "   Relancez avec --payant pour générer réellement la vidéo.",
    );
    return;
  }

  console.log("\n→ Synthèse vocale (OpenAI)");
  const debutVoix = Date.now();
  const mp3 = await genererVoix(texte);
  console.log(`   ${mp3.length} octets en ${Date.now() - debutVoix} ms`);

  console.log("\n→ Génération vidéo (fal.ai / VEED Fabric 1.0)");
  const url = await genererVideo(
    {
      imageUrl: await versUrlImage(image),
      audioUrl: enDataUri(mp3),
      resolution,
    },
    {
      surProgression: (statut, ecoule) =>
        console.log(`   ${statut.padEnd(12)} ${Math.round(ecoule / 1000)} s`),
    },
  );

  console.log(`\n   URL : ${url}`);

  // On télécharge : une URL fal.ai expire, et c'est le fichier qu'il faut
  // regarder pour décider si la fonction vaut la peine d'être construite.
  const sortie = join(process.cwd(), "video-test.mp4");
  const reponse = await fetch(url);
  await writeFile(sortie, Buffer.from(await reponse.arrayBuffer()));
  console.log(`   Enregistrée : ${sortie}`);
  console.log("\n→ Regardez-la. C'est elle qui décide de la suite.");
}

main().catch((erreur) => {
  console.error("\nÉCHEC :", erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
