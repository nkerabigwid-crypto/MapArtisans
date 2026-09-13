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

const { PERSONNAGES, choisirPersonnage, empreinte, urlPersonnage, bibliothequeComplete } =
  await import("../personnages.ts");
const { TRADES } = await import("@/lib/trades");

describe("Attribution des personnages", () => {
  test("le même profil reçoit toujours le même visage", () => {
    const premier = choisirPersonnage("profil-abc", "plombier");
    for (let i = 0; i < 50; i++) {
      assert.equal(choisirPersonnage("profil-abc", "plombier"), premier);
    }
  });

  test("deux profils du même couple ville/métier ne se ressemblent pas", () => {
    // Cas réel : trois plombiers genevois. Chacun voit les visages déjà pris.
    const a = choisirPersonnage("plombier-geneve-1", "plombier", []);
    const b = choisirPersonnage("plombier-geneve-2", "plombier", [a]);
    const c = choisirPersonnage("plombier-geneve-3", "plombier", [a, b]);
    assert.equal(new Set([a, b, c]).size, 3, "trois visages distincts attendus");
  });

  test("deux métiers différents ne partagent pas la même bibliothèque", () => {
    // Un chauffeur de taxi ne doit jamais hériter d'un visage en tenue de
    // plombier — la raison d'être du découpage par métier.
    const plombier = choisirPersonnage("profil-x", "plombier");
    const taxi = choisirPersonnage("profil-x", "taxi");
    assert.ok(PERSONNAGES.plombier.includes(plombier));
    assert.ok(PERSONNAGES.taxi.includes(taxi));
    assert.ok(!PERSONNAGES.taxi.includes(plombier));
  });

  test("un métier inconnu retombe sur « autre » plutôt que d'échouer", () => {
    const personnage = choisirPersonnage("profil-legacy", "metier-disparu");
    assert.ok(PERSONNAGES.autre.includes(personnage));
  });

  test("au-delà de la bibliothèque, on republie plutôt que d'échouer", () => {
    // Sept plombiers pour six visages : le septième doit obtenir un doublon,
    // pas une exception. Un post non publié coûte plus qu'un visage réutilisé.
    const tous = [...PERSONNAGES.plombier];
    const septieme = choisirPersonnage("plombier-geneve-7", "plombier", tous);
    assert.ok(PERSONNAGES.plombier.includes(septieme));
  });

  test("la répartition n'écrase pas un visage sur les autres, au sein d'un métier", () => {
    const compte = new Map();
    for (let i = 0; i < 600; i++) {
      const p = choisirPersonnage(`profil-${i}`, "plombier");
      compte.set(p, (compte.get(p) ?? 0) + 1);
    }
    assert.equal(compte.size, PERSONNAGES.plombier.length, "les six doivent servir");
    for (const [personnage, n] of compte) {
      // 100 attendus en moyenne. Une borne large suffit : on vérifie qu'aucun
      // visage n'est quasi jamais tiré, pas que la loi soit uniforme.
      assert.ok(n > 40 && n < 200, `${personnage} tiré ${n} fois sur 600`);
    }
  });

  test("chaque métier du catalogue a sa bibliothèque de personnages", () => {
    assert.ok(bibliothequeComplete());
    for (const t of TRADES) {
      assert.ok(
        Array.isArray(PERSONNAGES[t.value]) && PERSONNAGES[t.value].length > 0,
        `bibliothèque manquante pour ${t.value}`,
      );
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
