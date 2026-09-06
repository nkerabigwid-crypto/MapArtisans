/**
 * Suivi de position — geometrie, lecture du rang, deroulement d'un releve.
 *
 * La regle de classification etait ecrite et testee depuis l'origine. Ce qui
 * manquait, c'est le moteur : construire les points, les interroger, lire le
 * rang. Ces tests portent sur ce moteur.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL(process.cwd() + "/").href;
register(
  "data:text/javascript," +
    encodeURIComponent(`
      const ROOT = ${JSON.stringify(ROOT)};
      export async function resolve(s, c, n) {
        if (s === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
        if (s.startsWith("@/")) return n(new URL(s.slice(2) + ".ts", ROOT).href, c);
        if (s.startsWith(".") && !/\\.[cm]?[jt]s$/.test(s)) {
          try { return await n(s + ".ts", c); } catch {}
        }
        return n(s, c);
      }
    `),
  pathToFileURL("./"),
);

let grille, places, releve;
before(async () => {
  grille = await import("../grille.ts");
  places = await import("../places.ts");
  releve = await import("../releve.ts");
});

// Sion, ou se trouve l'editeur — et une latitude assez haute pour que la
// compression des longitudes se voie.
const SION = { lat: 46.2312, lng: 7.3589 };

describe("Geometrie de la grille", () => {
  test("neuf points, du coin nord-ouest au coin sud-est", () => {
    const p = grille.construireGrille(SION);
    assert.equal(p.length, 9);
    assert.equal(p[0].label, "A1");
    assert.equal(p[0].zone, "Nord-ouest");
    assert.equal(p[4].label, "B2");
    assert.equal(p[8].label, "C3");
    assert.equal(p[8].zone, "Sud-est");
  });

  test("le centre de la grille EST la fiche", () => {
    // Si le centre derivait, tous les releves porteraient sur un voisinage
    // decale — sans que rien ne le signale.
    const p = grille.construireGrille(SION);
    const centre = p.find((x) => x.label === "B2");
    assert.ok(Math.abs(centre.lat - SION.lat) < 1e-9);
    assert.ok(Math.abs(centre.lng - SION.lng) < 1e-9);
  });

  test("le nord est en HAUT, donc en latitude plus grande", () => {
    // L'index de ligne croit vers le bas de l'ecran, la latitude vers le haut
    // du globe. Confondre les deux retourne la carte.
    const p = grille.construireGrille(SION);
    const nord = p.find((x) => x.label === "A2");
    const sud = p.find((x) => x.label === "C2");
    assert.ok(nord.lat > SION.lat, "A2 doit etre au nord du centre");
    assert.ok(sud.lat < SION.lat, "C2 doit etre au sud");
  });

  test("un degre de longitude se retrecit avec la latitude", () => {
    /*
     * A 46,2°, un degre de longitude vaut ~77 km contre 111 a l'equateur.
     * Ignorer ce facteur donnerait une grille etiree d'un tiers en largeur :
     * les points lateraux tomberaient hors de la zone desservie.
     */
    const p = grille.construireGrille(SION);
    const est = p.find((x) => x.label === "B3");
    const nord = p.find((x) => x.label === "A2");
    const ecartLng = est.lng - SION.lng;
    const ecartLat = nord.lat - SION.lat;
    assert.ok(
      ecartLng > ecartLat * 1.3,
      "l'ecart en longitude doit etre plus grand que celui en latitude",
    );
  });

  test("le rayon ne deborde pas sur la case voisine", () => {
    // Un rayon egal au pas ferait remonter les memes concurrents partout et
    // lisserait ce que la grille cherche justement a montrer.
    assert.equal(grille.rayonMetres(1.5), 750);
  });
});

describe("Lecture du rang", () => {
  test("Google classe a partir de 1, les tableaux a partir de 0", () => {
    // C'est exactement la que se logent les erreurs de rang, et rien ne les
    // signale : un decalage d'un cran reste un nombre plausible.
    const r = places.lirePosition(["a", "b", "nous", "d"], "nous");
    assert.equal(r.position, 3);
  });

  test("absente des resultats : null, et non zero", () => {
    const r = places.lirePosition(["a", "b"], "nous");
    assert.equal(r.position, null);
    assert.equal(r.topConcurrentPlaceId, "a");
  });

  test("premier de la liste : aucun concurrent a nommer", () => {
    const r = places.lirePosition(["nous", "b"], "nous");
    assert.equal(r.position, 1);
    assert.equal(r.topConcurrentPlaceId, null, "l'artisan n'est pas son propre concurrent");
  });

  test("aucun resultat du tout", () => {
    const r = places.lirePosition([], "nous");
    assert.equal(r.position, null);
    assert.equal(r.topConcurrentPlaceId, null);
  });
});

describe("Deroulement d'un releve", () => {
  const fiche = { placeId: "nous", latitude: SION.lat, longitude: SION.lng, pays: "CH" };
  const sansAttente = async () => {};

  test("neuf points interroges, un par point de grille", async () => {
    let appels = 0;
    const transport = async () => {
      appels += 1;
      return { ok: true, status: 200, json: async () => ({ places: [{ id: "nous" }] }) };
    };
    const r = await releve.releverGrille(fiche, "plombier sion", {
      cle: "test", transport, pause: sansAttente,
    });
    assert.equal(appels, 9);
    assert.equal(r.points.length, 9);
    assert.equal(r.echecs, 0);
    assert.ok(r.points.every((p) => p.position === 1));
  });

  test("un point en echec n'annule pas les huit autres", async () => {
    /*
     * Interrompre a la premiere erreur ferait qu'un incident reseau sur le
     * huitieme point efface les sept precedents. Le releve partiel reste
     * utile : huit cases sur neuf disent deja quelque chose.
     */
    let n = 0;
    const transport = async () => {
      n += 1;
      if (n === 8) throw new Error("reseau");
      return { ok: true, status: 200, json: async () => ({ places: [{ id: "nous" }] }) };
    };
    const r = await releve.releverGrille(fiche, "plombier sion", {
      cle: "test", transport, pause: sansAttente,
    });
    assert.equal(r.points.length, 9, "la grille reste complete");
    assert.equal(r.echecs, 1);
    assert.equal(r.points[7].position, null, "la case non servie est marquee introuvable");
  });

  test("« aucun resultat » n'est pas une panne", async () => {
    // Places omet `places` quand rien ne correspond. Traiter l'absence comme
    // une erreur ferait echouer un releve parfaitement valide.
    const transport = async () => ({ ok: true, status: 200, json: async () => ({}) });
    const r = await releve.releverGrille(fiche, "introuvable", {
      cle: "test", transport, pause: sansAttente,
    });
    assert.equal(r.echecs, 0, "ce n'est pas un echec");
    assert.ok(r.points.every((p) => p.position === null));
  });

  test("seul l'identifiant est demande a Google", async () => {
    /*
     * Deux raisons, et la seconde est juridique : `places.id` seul place
     * l'appel dans le palier gratuit, ET c'est le seul champ que les
     * conditions de la Maps Platform autorisent a conserver en base.
     */
    let masque = null;
    const transport = async (_url, init) => {
      masque = init.headers["X-Goog-FieldMask"];
      return { ok: true, status: 200, json: async () => ({ places: [] }) };
    };
    await releve.releverGrille(fiche, "plombier", {
      cle: "test", transport, pause: sansAttente,
    });
    assert.equal(masque, "places.id");
  });

  test("sans cle, le module le dit au lieu d'appeler dans le vide", async () => {
    await assert.rejects(
      () => places.interrogerPoint(
        { motCle: "x", lat: 0, lng: 0, placeIdArtisan: "nous" },
        { cle: "" },
      ),
      /GOOGLE_PLACES_API_KEY/,
    );
  });
});

describe("Mot-cle de depart", () => {
  test("ce que tape le client, pas ce qu'ecrit l'artisan", () => {
    assert.equal(releve.motCleParDefaut("plombier", "Sion"), "plombier sion");
  });

  test("sans metier ou sans ville, aucun mot-cle invente", () => {
    // Un « undefined sion » suivi chaque semaine serait pire que rien.
    assert.equal(releve.motCleParDefaut("", "Sion"), null);
    assert.equal(releve.motCleParDefaut("plombier", null), null);
    assert.equal(releve.motCleParDefaut("  ", " "), null);
  });
});
