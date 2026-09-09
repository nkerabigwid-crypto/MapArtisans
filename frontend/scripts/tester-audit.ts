/**
 * Épreuve de vérité de l'audit : une Geo-Grid RÉELLE, sans OAuth.
 *
 * POURQUOI CE SCRIPT EXISTE
 *
 * Jusqu'ici le suivi de position ne pouvait pas démarrer : ses coordonnées ne
 * venaient que du rattachement OAuth de la fiche Google, donc de l'API
 * Business Profile, dont l'accès n'est pas accordé. Places API, elle,
 * fonctionne — et sait retrouver un établissement par son nom.
 *
 * Ce script vérifie que la chaîne complète tient debout :
 *
 *     nom + ville  ->  place_id + coordonnées  ->  neuf relevés  ->  la carte
 *
 * Et il la vérifie contre la VRAIE API. Deux fois déjà dans ce projet, un
 * appel a été écrit d'après la documentation et n'aurait jamais abouti : la
 * charge utile de Fabric, et les data URI. On ne considère plus qu'un service
 * fonctionne avant de l'avoir vu répondre.
 *
 * COÛT
 *
 * La résolution est facturée (elle demande la position), les neuf relevés de
 * grille ne le sont pas (palier « IDs Only »). Un audit coûte donc un appel
 * payant, pas dix.
 *
 *   npm run audit:test -- --nom "Dupont Plomberie" --ville "Genève" --motcle "plombier genève"
 */
import { resoudreEtablissement } from "../lib/server/tracking/resoudre";
import { releverGrille } from "../lib/server/tracking/releve";
import { getGridStatus } from "../lib/data";

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    console.error(
      "ERREUR : GOOGLE_PLACES_API_KEY absente de .env.local.\n" +
        "  Elle est renseignée en production ; copiez-la localement pour cet essai.",
    );
    process.exit(1);
  }

  const nom = argument("nom");
  const ville = argument("ville");
  if (!nom || !ville) {
    console.error('Usage : npm run audit:test -- --nom "Dupont Plomberie" --ville "Genève"');
    process.exit(1);
  }
  const motCle = argument("motcle") ?? `${nom.split(" ")[1] ?? nom} ${ville}`;
  const pays = argument("pays") ?? "CH";

  console.log("→ Résolution de l'établissement (Places API, appel facturé)");
  const fiche = await resoudreEtablissement({ nom, ville, pays });
  console.log(`   ${fiche.nom}`);
  console.log(`   ${fiche.adresse ?? "adresse non publiée"}`);
  console.log(`   ${fiche.placeId}  ·  ${fiche.latitude}, ${fiche.longitude}`);

  console.log(`\n→ Relevé de la grille, mot-clé « ${motCle} »`);
  const releve = await releverGrille(
    {
      placeId: fiche.placeId,
      latitude: fiche.latitude,
      longitude: fiche.longitude,
      pays,
    },
    motCle,
  );

  console.log();
  for (const p of releve.points) {
    const rang = p.position === null ? "  —" : String(p.position).padStart(3);
    const etat = p.position === null ? "hors radar" : getGridStatus(p.position);
    console.log(`   ${p.area.padEnd(22)} ${rang}   ${etat}`);
  }

  const vus = releve.points.filter((p) => p.position !== null && p.position <= 3).length;
  console.log(
    `\n→ ${vus} point(s) sur ${releve.points.length} dans le top 3` +
      (releve.echecs ? `, ${releve.echecs} relevé(s) refusé(s) par Google` : ""),
  );
  console.log("   Cette carte est RÉELLE. Aucun rattachement OAuth n'a été nécessaire.");
}

main().catch((erreur) => {
  console.error("\nÉCHEC :", erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
