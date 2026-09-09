/**
 * Cadence des posts vidéo.
 *
 * Ce qui est vérifié ici tient la facture. Une clé de période qui changerait
 * deux fois dans le même mois pour le palier Basique produirait deux vidéos au
 * lieu d'une : 4,10 CHF de coût sur un abonnement à 49 CHF au lieu de 2,05 —
 * et la marge calculée ne serait plus la marge réelle.
 *
 * Exécution : node --test lib/server/video/__tests__/cadence.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const projectRoot = pathToFileURL(process.cwd() + "/").href;
register(
  "data:text/javascript," +
    encodeURIComponent(`
      const ROOT = ${JSON.stringify(projectRoot)};
      export async function resolve(spec, ctx, next) {
        if (spec.startsWith("@/")) return next(new URL(spec.slice(2) + ".ts", ROOT).href, ctx);
        if (spec.startsWith(".") && !/\\.[cm]?[jt]s$/.test(spec)) {
          try { return await next(spec + ".ts", ctx); } catch {}
        }
        return next(spec, ctx);
      }
    `),
  pathToFileURL("./"),
);

const { VIDEOS_PAR_MOIS, clePeriode, paletDonneDroitAVideo } = await import("../cadence.ts");

const jour = (a, m, j) => new Date(a, m - 1, j, 12, 0, 0);

describe("Cadence par palier", () => {
  test("Basique : une seule clé pour tout le mois", () => {
    const cles = new Set();
    for (let j = 1; j <= 30; j++) cles.add(clePeriode("basique", jour(2026, 9, j)));
    assert.equal(cles.size, 1, "un mois = une vidéo");
    assert.equal([...cles][0], "2026-09");
  });

  test("Essentiel : exactement deux clés, séparées d'une quinzaine", () => {
    const cles = new Set();
    for (let j = 1; j <= 30; j++) cles.add(clePeriode("essentiel", jour(2026, 9, j)));
    assert.deepEqual([...cles].sort(), ["2026-09a", "2026-09b"]);
    // La bascule tombe bien au 16 : une fiche animée puis muette trois
    // semaines serait pire que pas de régularité du tout.
    assert.equal(clePeriode("essentiel", jour(2026, 9, 15)), "2026-09a");
    assert.equal(clePeriode("essentiel", jour(2026, 9, 16)), "2026-09b");
  });

  test("Professionnel : quatre à cinq clés par mois, jamais moins", () => {
    const cles = new Set();
    for (let j = 1; j <= 30; j++) cles.add(clePeriode("professionnel", jour(2026, 9, j)));
    assert.ok(cles.size >= 4 && cles.size <= 5, `${cles.size} semaines`);
    for (const c of cles) assert.match(c, /^\d{4}-W\d{2}$/);
  });

  test("un palier inconnu ne produit rien", () => {
    // Ne rien produire plutôt que produire a perte : un identifiant qu'on ne
    // reconnaît pas n'a pas de revenu associé.
    for (const inconnu of ["gratuit", "entreprise", "", null, undefined]) {
      assert.equal(clePeriode(inconnu, jour(2026, 9, 10)), null);
      assert.equal(paletDonneDroitAVideo(inconnu), false);
    }
  });

  test("la même date donne toujours la même clé", () => {
    // L'idempotence est ce qui rend la déduplication en base fiable : deux
    // instances du planificateur doivent calculer la même clé.
    for (const palier of Object.keys(VIDEOS_PAR_MOIS)) {
      const d = jour(2026, 9, 17);
      assert.equal(clePeriode(palier, d), clePeriode(palier, new Date(d)));
    }
  });

  test("sur douze mois, le compte tient l'enveloppe budgétaire", () => {
    // Le test qui protège la grille tarifaire. On balaie une année entière et
    // on compte les périodes distinctes.
    const attendu = { basique: [12, 12], essentiel: [24, 24], professionnel: [52, 53] };
    for (const [palier, [min, max]] of Object.entries(attendu)) {
      const cles = new Set();
      for (let m = 1; m <= 12; m++) {
        for (let j = 1; j <= 28; j++) cles.add(clePeriode(palier, jour(2026, m, j)));
        // Les fins de mois, que la boucle à 28 jours manquerait.
        for (let j = 29; j <= 31; j++) {
          const d = jour(2026, m, j);
          if (d.getMonth() === m - 1) cles.add(clePeriode(palier, d));
        }
      }
      assert.ok(
        cles.size >= min && cles.size <= max,
        `${palier} : ${cles.size} vidéos sur l'année, attendu entre ${min} et ${max}`,
      );
    }
  });
});
