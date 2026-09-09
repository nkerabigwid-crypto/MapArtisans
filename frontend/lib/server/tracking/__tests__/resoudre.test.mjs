/**
 * Résolution d'un établissement par son nom et sa ville.
 *
 * C'est la pièce qui rend la Geo-Grid calculable SANS rattachement OAuth :
 * jusqu'ici les coordonnées ne venaient que de l'API Business Profile, dont
 * l'accès n'est pas accordé. Les tests portent donc sur ce qui doit rester
 * vrai pour qu'un audit puisse tourner devant un prospect.
 *
 * Aucun appel réseau : le transport est injecté.
 *
 * Exécution : node --test lib/server/tracking/__tests__/resoudre.test.mjs
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

const { resoudreEtablissement, EtablissementIntrouvable } = await import("../resoudre.ts");

const reponse = (corps, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => corps,
});

const TROUVE = {
  places: [
    {
      id: "ChIJabc123",
      displayName: { text: "Dupont Plomberie" },
      formattedAddress: "Rue du Test 1, 1200 Genève",
      location: { latitude: 46.2044, longitude: 6.1432 },
    },
  ],
};

describe("Résolution d'un établissement", () => {
  test("rend l'identifiant et les coordonnées, de quoi centrer une grille", async () => {
    const resolu = await resoudreEtablissement(
      { nom: "Dupont Plomberie", ville: "Genève" },
      { cle: "factice", transport: async () => reponse(TROUVE) },
    );
    assert.equal(resolu.placeId, "ChIJabc123");
    assert.equal(resolu.latitude, 46.2044);
    assert.equal(resolu.longitude, 6.1432);
    assert.equal(resolu.adresse, "Rue du Test 1, 1200 Genève");
  });

  test("ne demande QUE les champs nécessaires", async () => {
    // Chaque champ demandé peut faire basculer de palier de facturation. Ce
    // test fige la frugalité : ni horaires, ni photos, ni avis.
    let entetes;
    await resoudreEtablissement(
      { nom: "Dupont", ville: "Genève" },
      {
        cle: "factice",
        transport: async (_url, init) => {
          entetes = init.headers;
          return reponse(TROUVE);
        },
      },
    );
    const masque = entetes["X-Goog-FieldMask"];
    assert.match(masque, /places\.id/);
    assert.match(masque, /places\.location/);
    for (const cher of ["photos", "reviews", "regularOpeningHours", "priceLevel"]) {
      assert.ok(!masque.includes(cher), `${cher} ne doit pas être demandé`);
    }
  });

  test("un seul résultat demandé : on cherche un établissement, pas une liste", async () => {
    let corps;
    await resoudreEtablissement(
      { nom: "Dupont", ville: "Genève" },
      {
        cle: "factice",
        transport: async (_url, init) => {
          corps = JSON.parse(init.body);
          return reponse(TROUVE);
        },
      },
    );
    assert.equal(corps.maxResultCount, 1);
    assert.equal(corps.textQuery, "Dupont Genève");
    assert.equal(corps.regionCode, "CH");
  });

  test("l'absence de résultat est explicite, pas un plantage", async () => {
    // Google omet `places` quand rien ne correspond — il ne renvoie pas un
    // tableau vide. L'artisan doit lire un message actionnable, pas une
    // exception technique.
    await assert.rejects(
      resoudreEtablissement(
        { nom: "Introuvable SA", ville: "Nulle Part" },
        { cle: "factice", transport: async () => reponse({}) },
      ),
      (e) => e instanceof EtablissementIntrouvable && /orthographe/.test(e.message),
    );
  });

  test("un résultat sans coordonnées est refusé", async () => {
    // Une grille sans centre ne se calcule pas : mieux vaut refuser que
    // produire neuf appels autour de l'origine du repère.
    await assert.rejects(
      resoudreEtablissement(
        { nom: "Dupont", ville: "Genève" },
        {
          cle: "factice",
          transport: async () => reponse({ places: [{ id: "ChIJabc", displayName: {} }] }),
        },
      ),
      EtablissementIntrouvable,
    );
  });

  test("le pays oriente la recherche", async () => {
    let corps;
    await resoudreEtablissement(
      { nom: "Dupont", ville: "Lyon", pays: "FR" },
      {
        cle: "factice",
        transport: async (_url, init) => {
          corps = JSON.parse(init.body);
          return reponse(TROUVE);
        },
      },
    );
    assert.equal(corps.regionCode, "FR");
  });
});
