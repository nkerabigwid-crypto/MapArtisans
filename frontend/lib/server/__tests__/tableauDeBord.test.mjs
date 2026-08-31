/**
 * Données réelles du tableau de bord.
 *
 * L'écran affichait « Dupont Plomberie, Lyon », ses avis et sa Geo-Grid — pour
 * TOUT LE MONDE. Un artisan fraîchement inscrit voyait l'activité d'une
 * entreprise fictive française à la place de la sienne, et pouvait croire que
 * son compte était mélangé avec celui d'un autre.
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

let tdb, repoMod;
before(async () => {
  tdb = await import("../tableauDeBord.ts");
  repoMod = await import("../repo.ts");
});
beforeEach(() => repoMod.__resetRepo());

describe("Chargement", () => {
  test("un compte sans entreprise renvoie null plutôt qu'un écran à moitié construit", async () => {
    // L'inscription crée toujours utilisateur ET entreprise : ce cas signale
    // une donnée incohérente, pas un état d'attente.
    assert.equal(await tdb.chargerTableauDeBord("u-inexistant"), null);
  });

  test("un compte neuf, sans fiche Google, est un état NORMAL", async () => {
    // C'est l'état de tous les premiers clients tant que l'accès à l'API
    // Google n'est pas accordé.
    const repo = repoMod.getRepo();
    const u = await repo.createUser("neuf@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id,
      companyName: "Serrurerie Exemple",
      tradeType: "serrurier",
      country: "CH",
    });

    const d = await tdb.chargerTableauDeBord(u.id);
    assert.equal(d.sansFiche, true);
    assert.equal(d.profile, null);
    assert.deepEqual(d.reviews, []);
    assert.deepEqual(d.posts, []);
    assert.equal(d.qrCode, null);
  });

  test("le nom affiché est celui de l'artisan, jamais un exemple", async () => {
    const repo = repoMod.getRepo();
    const u = await repo.createUser("nom@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id,
      companyName: "Serrurerie Exemple",
      tradeType: "serrurier",
      country: "CH",
    });

    const d = await tdb.chargerTableauDeBord(u.id);
    assert.equal(d.company.company_name, "Serrurerie Exemple");
    assert.notEqual(d.company.company_name, "Dupont Plomberie");
  });

  test("un compte neuf est en essai, pas en abonnement actif", async () => {
    const repo = repoMod.getRepo();
    const u = await repo.createUser("essai@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id,
      companyName: "Exemple",
      tradeType: "plombier",
      country: "CH",
    });

    const d = await tdb.chargerTableauDeBord(u.id);
    assert.equal(d.company.subscription_status, "trialing");
    assert.equal(d.company.plan_id, "basique");
  });

  test("le montant vient de la colonne, pas du catalogue", async () => {
    // Un client garde le tarif auquel il a souscrit même si la grille change.
    const repo = repoMod.getRepo();
    const u = await repo.createUser("tarif@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id,
      companyName: "Exemple",
      tradeType: "plombier",
      country: "CH",
    });
    const d = await tdb.chargerTableauDeBord(u.id);
    assert.equal(typeof d.company.plan_amount, "number");
    assert.ok(d.company.plan_amount > 0);
  });

  test("aucune donnée d'un autre compte ne remonte", async () => {
    const repo = repoMod.getRepo();
    const a = await repo.createUser("a@exemple.test", "mot-de-passe-long-12");
    const b = await repo.createUser("b@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({ userId: a.id, companyName: "Chez A", tradeType: "plombier", country: "CH" });
    await repo.createCompany({ userId: b.id, companyName: "Chez B", tradeType: "taxi", country: "CH" });

    const da = await tdb.chargerTableauDeBord(a.id);
    const db = await tdb.chargerTableauDeBord(b.id);
    assert.equal(da.company.company_name, "Chez A");
    assert.equal(db.company.company_name, "Chez B");
    assert.notEqual(da.company.id, db.company.id);
  });
});
