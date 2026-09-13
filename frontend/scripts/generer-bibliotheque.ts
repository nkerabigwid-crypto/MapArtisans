/**
 * Construit la bibliothèque complète de personnages — un lot de six par
 * métier, pour tous les métiers de lib/trades.ts (sauf « Autre », déjà
 * couvert par les six fichiers hérités de l'ancienne bibliothèque unique).
 *
 * RIEN N'EST FACTURÉ SANS `--payant`
 *
 * Même précaution que scripts/tester-video.ts : ce script calcule le nombre
 * d'appels et s'arrête, pour qu'un lancement distrait ne coûte rien.
 *
 * REPRISE SANS DOUBLE FACTURATION
 *
 * Un fichier déjà présent sur disque est sauté, pas régénéré — un script de
 * 114 appels a plus de chances qu'un script de 9 (voir tester-audit.ts) de
 * s'interrompre à mi-chemin sur un incident réseau. Relancer après coup ne
 * repaie que ce qui manque. `--forcer` régénère tout malgré tout.
 *
 *   npx tsx scripts/generer-bibliotheque.ts
 *   npx tsx scripts/generer-bibliotheque.ts --payant
 *   npx tsx scripts/generer-bibliotheque.ts --payant --metiers taxi,plombier
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { TRADES } from "../lib/trades";
import { VARIANTES_PERSONNE } from "../lib/server/video/tenues";
import { construirePrompt, genererImagePersonnage } from "../lib/server/video/genererPersonnage";

/** Estimation, alignée sur le coût observé hier pour un personnage isolé —
 *  pas un tarif contractuel de fal.ai, qui ne le renvoie pas par appel. */
const COUT_ESTIME_PAR_IMAGE_USD = 0.02;
const PAUSE_MS = 400;
const DOSSIER_SORTIE = join(process.cwd(), "public", "personnages");

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const payant = process.argv.includes("--payant");
  const forcer = process.argv.includes("--forcer");
  const filtre = argument("metiers")?.split(",").map((m) => m.trim());

  const metiers = TRADES.filter((t) => t.value !== "autre").filter(
    (t) => !filtre || filtre.includes(t.value),
  );

  const taches = metiers.flatMap((t) =>
    VARIANTES_PERSONNE.map((_, i) => ({
      metier: t.value,
      label: t.label,
      variante: i,
      fichier: `${t.value}-${String(i + 1).padStart(2, "0")}.png`,
    })),
  );

  const cle = process.env.FAL_KEY;
  if (!cle) {
    console.error("ERREUR : FAL_KEY absente. Renseignez-la dans .env.local.");
    process.exit(1);
  }

  await mkdir(DOSSIER_SORTIE, { recursive: true });
  const aFaire = forcer ? taches : taches.filter((t) => !existsSync(join(DOSSIER_SORTIE, t.fichier)));
  const dejaPresents = taches.length - aFaire.length;

  console.log("→ Plan");
  console.log(`   métiers            ${metiers.length} (${metiers.map((m) => m.value).join(", ")})`);
  console.log(`   images au total    ${taches.length} (${VARIANTES_PERSONNE.length} par métier)`);
  if (dejaPresents > 0) {
    console.log(`   déjà présentes     ${dejaPresents} (sautées, utilisez --forcer pour regénérer)`);
  }
  console.log(`   à générer          ${aFaire.length}`);
  console.log(`   coût estimé        ${(aFaire.length * COUT_ESTIME_PAR_IMAGE_USD).toFixed(2)} $ (approximatif)`);

  if (!payant) {
    console.log("\n→ Arrêt : aucun appel facturé n'a été fait.");
    console.log("   Relancez avec --payant pour générer réellement les images.");
    return;
  }

  if (aFaire.length === 0) {
    console.log("\n→ Rien à faire : toutes les images demandées existent déjà.");
    return;
  }

  console.log(`\n→ Génération de ${aFaire.length} image(s)`);
  let echecs = 0;
  for (const [index, tache] of aFaire.entries()) {
    const prompt = construirePrompt(tache.metier, tache.variante);
    const sortie = join(DOSSIER_SORTIE, tache.fichier);
    try {
      const image = await genererImagePersonnage(prompt, cle);
      await writeFile(sortie, image.octets);
      console.log(`   [${index + 1}/${aFaire.length}] ${tache.fichier}  (${tache.label})`);
    } catch (erreur) {
      echecs += 1;
      console.error(
        `   [${index + 1}/${aFaire.length}] ÉCHEC ${tache.fichier} : ${
          erreur instanceof Error ? erreur.message : erreur
        }`,
      );
    }
    if (index < aFaire.length - 1) await pause(PAUSE_MS);
  }

  console.log(`\n→ Terminé. ${aFaire.length - echecs} image(s) écrite(s), ${echecs} échec(s).`);
  if (echecs > 0) {
    console.log("   Relancez le même appel : les fichiers déjà écrits seront sautés.");
  }
}

main().catch((erreur) => {
  console.error("\nÉCHEC :", erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
