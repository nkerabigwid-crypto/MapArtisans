/**
 * Complétude des tenues — voir la note en tête de tenues.ts sur le risque de
 * divergence avec lib/trades.ts (déjà arrivé une fois entre la page d'accueil
 * et le formulaire d'inscription, d'où l'existence même de trades.ts).
 *
 * Exécution : node --test lib/server/video/__tests__/tenues.test.mjs
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

const { TENUE_PAR_METIER, VARIANTES_PERSONNE, verifierCompletude } = await import("../tenues.ts");
const { TRADES } = await import("@/lib/trades");

describe("Tenues des personnages", () => {
  test("chaque métier du catalogue a une tenue", () => {
    assert.doesNotThrow(() => verifierCompletude());
  });

  test("aucune tenue orpheline (métier disparu de trades.ts)", () => {
    const valeurs = new Set(TRADES.map((t) => t.value));
    for (const cle of Object.keys(TENUE_PAR_METIER)) {
      assert.ok(valeurs.has(cle), `« ${cle} » a une tenue mais n'existe plus dans TRADES`);
    }
  });

  test("six variantes de personne, pour distinguer les visages d'un même métier", () => {
    assert.equal(VARIANTES_PERSONNE.length, 6);
    assert.equal(new Set(VARIANTES_PERSONNE).size, 6, "les six variantes doivent être distinctes");
  });
});
