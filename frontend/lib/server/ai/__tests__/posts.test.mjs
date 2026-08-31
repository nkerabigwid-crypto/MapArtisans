/**
 * Génération des publications Google.
 *
 * Ces tests portent surtout sur ce que le prompt REFUSE de produire. Un texte
 * bourré de mots-clés est le réflexe du modèle sur ce type de demande : il ne
 * fait pas monter la fiche — la fréquence de publication n'est pas un critère
 * de classement local — et il donne à l'artisan un texte que personne ne lit.
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
        if (s === "next/server") return n("next/server.js", c);
        if (s.startsWith("@/")) return n(new URL(s.slice(2) + ".ts", ROOT).href, c);
        if (s.startsWith(".") && !/\\.[cm]?[jt]s$/.test(s)) {
          try { return await n(s + ".ts", c); } catch {}
        }
        return n(s, c);
      }
    `),
  pathToFileURL("./"),
);

let posts;
before(async () => { posts = await import("../posts.ts"); });

const CTX = {
  businessName: "Dépannage Exemple",
  city: "Sion",
  tradeType: "plombier",
  sujet: "conseil",
};

describe("Prompt de publication", () => {
  test("interdit explicitement l'accumulation de mots-clés", () => {
    const { system } = posts.buildPostPrompt(CTX);
    assert.match(system, /N'accumule PAS les mots-clés/);
  });

  test("interdit prix, délais et superlatifs", () => {
    const { system } = posts.buildPostPrompt(CTX);
    // Un prix annoncé engage l'artisan ; un superlatif l'expose à la LCD.
    assert.match(system, /Aucun prix/);
    assert.match(system, /superlatif/);
  });

  test("interdit de citer un client", () => {
    // Publier « intervention chez M. Dupont à la rue X » sur une fiche publique
    // est une divulgation de données personnelles.
    const { system } = posts.buildPostPrompt(CTX);
    assert.match(system, /Ne cite jamais un client/);
  });

  test("injecte le vocabulaire du métier", () => {
    const { system } = posts.buildPostPrompt(CTX);
    assert.match(system, /fuite/, "le lexique du plombier doit être présent");
  });

  test("refuse un sujet inconnu en retombant sur le premier", () => {
    const { user } = posts.buildPostPrompt({ ...CTX, sujet: "inexistant" });
    assert.match(user, /Sujet :/);
  });

  test("les précisions de l'artisan sont transmises", () => {
    const { user } = posts.buildPostPrompt({ ...CTX, precisions: "fermé le 12" });
    assert.match(user, /fermé le 12/);
  });
});

describe("Troncature", () => {
  test("un texte court n'est pas touché", () => {
    assert.equal(posts.tronquerPost("  Court.  "), "Court.");
  });

  test("coupe à la fin de phrase, jamais au milieu d'un mot", () => {
    const long = "Première phrase courte. " + "mot ".repeat(400);
    const r = posts.tronquerPost(long, 100);
    assert.ok(r.length <= 100);
    assert.ok(r.endsWith(".") || r.endsWith("…"), `fin inattendue : ${JSON.stringify(r.slice(-10))}`);
  });

  test("respecte la limite de Google", () => {
    // 1500 est la limite réelle ; on vise bien plus court, un post tronqué par
    // Google ayant l'air bâclé.
    assert.ok(posts.LONGUEUR_MAX < 1500);
  });
});

describe("Sujets proposés", () => {
  test("les sujets sont fermés : le modèle n'en invente pas", () => {
    assert.ok(posts.SUJETS.length >= 3);
    for (const s of posts.SUJETS) {
      assert.equal(typeof s.tag, "string");
      assert.equal(typeof s.libelle, "string");
    }
  });

  test("chaque étiquette est unique — elle est écrite en base", () => {
    const tags = posts.SUJETS.map((s) => s.tag);
    assert.equal(new Set(tags).size, tags.length);
  });
});
