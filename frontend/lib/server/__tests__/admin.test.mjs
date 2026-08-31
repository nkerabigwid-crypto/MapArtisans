/**
 * Console d'administration.
 *
 * Ces tests portent d'abord sur ce que la console NE FAIT PAS : elle ne peut
 * rien écrire et ne renvoie aucune donnée personnelle. Une console qui déverse
 * la table `users` devient, le jour d'une intrusion, la fuite elle-même.
 */
import { test, describe, before, beforeEach } from "node:test";
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

let repoMod;
before(async () => { repoMod = await import("../repo.ts"); });
beforeEach(() => repoMod.__resetRepo());

describe("Statistiques", () => {
  test("ne renvoie QUE des agrégats, aucune ligne nominative", async () => {
    const repo = repoMod.getRepo();
    await repo.createUser("client@exemple.test", "mot-de-passe-long-12");
    const s = await repo.statistiquesAdmin();

    const brut = JSON.stringify(s);
    assert.ok(!brut.includes("client@exemple.test"), "aucune adresse e-mail ne doit sortir");
    assert.ok(!brut.includes("@"), "aucune donnée nominative dans les statistiques");
    for (const v of [s.comptes, s.entreprises, s.fiches, s.avis, s.smsCeMois]) {
      assert.equal(typeof v, "number");
    }
  });

  test("compte les comptes réellement créés", async () => {
    const repo = repoMod.getRepo();
    const avant = (await repo.statistiquesAdmin()).comptes;
    await repo.createUser("a@exemple.test", "mot-de-passe-long-12");
    await repo.createUser("b@exemple.test", "mot-de-passe-long-12");
    assert.equal((await repo.statistiquesAdmin()).comptes, avant + 2);
  });

  test("ventile les abonnements et les paliers", async () => {
    const repo = repoMod.getRepo();
    const u = await repo.createUser("v@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id, companyName: "Ex", tradeType: "plombier", country: "CH",
    });
    const s = await repo.statistiquesAdmin();
    // Un compte neuf naît en essai, au palier d'entrée.
    assert.ok(s.abonnements.trialing >= 1);
    assert.ok(s.paliers.basique >= 1);
  });

  test("suit le poste de coût qui monte vraiment : le SMS", async () => {
    // Un SMS coûte dix à cinquante fois une réponse générée par l'IA.
    const repo = repoMod.getRepo();
    await repo.incrementerSmsDuMois("c-001");
    await repo.incrementerSmsDuMois("c-001");
    assert.equal((await repo.statistiquesAdmin()).smsCeMois, 2);
  });

  test("le montant facturé est en centimes, jamais en francs flottants", async () => {
    // Un montant en francs à virgule flottante finit par produire 148.99999.
    const repo = repoMod.getRepo();
    await repo.creerFacture({
      userId: "u-1", clientNom: "x@exemple.test", clientEmail: "x@exemple.test",
      designation: "Abonnement", montantCentimes: 14900, devise: "CHF",
      tvaIde: null, stripeSessionId: "cs_admin",
    });
    const s = await repo.statistiquesAdmin();
    assert.equal(s.montantFactureCentimes, 14900);
    assert.ok(Number.isInteger(s.montantFactureCentimes));
  });
});

describe("Rôle", () => {
  test("un compte naît SANS privilège", async () => {
    // Le rôle admin ne s'obtient que depuis le serveur, jamais à l'inscription.
    const repo = repoMod.getRepo();
    const u = await repo.createUser("neuf@exemple.test", "mot-de-passe-long-12");
    assert.equal(u.role, "artisan");
    assert.notEqual(u.role, "admin");
  });
});
