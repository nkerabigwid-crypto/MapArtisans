/**
 * Attribution des personnages des posts vidéo.
 *
 * Les deux propriétés vérifiées ici ne sont pas décoratives : la stabilité est
 * ce qui fait qu'une clientèle reconnaît « son » porte-parole, et l'absence de
 * collision locale est ce qui empêche deux plombiers voisins de publier le même
 * visage. Un bug sur l'une ou l'autre ne casserait rien — il rendrait
 * simplement le procédé visible, ce qui est pire.
 *
 * Exécution : node --test lib/server/video/__tests__/personnages.test.mjs
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

const { PERSONNAGES, choisirPersonnage, empreinte, urlPersonnage } = await import(
  "../personnages.ts"
);

describe("Attribution des personnages", () => {
  test("le même profil reçoit toujours le même visage", () => {
    const premier = choisirPersonnage("profil-abc");
    for (let i = 0; i < 50; i++) {
      assert.equal(choisirPersonnage("profil-abc"), premier);
    }
  });

  test("deux profils du même couple ville/métier ne se ressemblent pas", () => {
    // Cas réel : trois plombiers genevois. Chacun voit les visages déjà pris.
    const a = choisirPersonnage("plombier-geneve-1", []);
    const b = choisirPersonnage("plombier-geneve-2", [a]);
    const c = choisirPersonnage("plombier-geneve-3", [a, b]);
    assert.equal(new Set([a, b, c]).size, 3, "trois visages distincts attendus");
  });

  test("au-delà de la bibliothèque, on republie plutôt que d'échouer", () => {
    // Sept plombiers pour six visages : le septième doit obtenir un doublon,
    // pas une exception. Un post non publié coûte plus qu'un visage réutilisé.
    const tous = [...PERSONNAGES];
    const septieme = choisirPersonnage("plombier-geneve-7", tous);
    assert.ok(PERSONNAGES.includes(septieme));
  });

  test("la répartition n'écrase pas un visage sur les autres", () => {
    const compte = new Map();
    for (let i = 0; i < 600; i++) {
      const p = choisirPersonnage(`profil-${i}`);
      compte.set(p, (compte.get(p) ?? 0) + 1);
    }
    assert.equal(compte.size, PERSONNAGES.length, "les six doivent servir");
    for (const [personnage, n] of compte) {
      // 100 attendus en moyenne. Une borne large suffit : on vérifie qu'aucun
      // visage n'est quasi jamais tiré, pas que la loi soit uniforme.
      assert.ok(n > 40 && n < 200, `${personnage} tiré ${n} fois sur 600`);
    }
  });

  test("l'empreinte est stable et tient dans 32 bits non signés", () => {
    assert.equal(empreinte("mapartisans"), empreinte("mapartisans"));
    assert.notEqual(empreinte("a"), empreinte("b"));
    for (const v of ["", "a", "profil-42", "é".repeat(100)]) {
      const h = empreinte(v);
      assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
    }
  });

  test("l'URL publique ne double jamais la barre oblique", () => {
    assert.equal(
      urlPersonnage("01.png", "https://mapartisans.com/"),
      "https://mapartisans.com/personnages/01.png",
    );
    assert.equal(
      urlPersonnage("01.png", "https://mapartisans.com"),
      "https://mapartisans.com/personnages/01.png",
    );
  });
});
