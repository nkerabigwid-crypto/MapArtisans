/**
 * Paiement Stripe — clés, idempotence, sécurité du webhook.
 *
 * La majorité de ces tests portent sur ce qu'on REFUSE : l'adresse du webhook
 * est publique, et une session Checkout ouverte au mauvais nom se règle par un
 * remboursement.
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

let stripe, repoMod;
before(async () => {
  stripe = await import("../stripe.ts");
  repoMod = await import("../../repo.ts");
});

describe("Clé Stripe", () => {
  test("une clé absente échoue avec un message explicite", () => {
    delete process.env.STRIPE_SECRET_KEY;
    assert.throws(() => stripe.getStripe(), /STRIPE_SECRET_KEY absente/);
  });

  test("une clé au mauvais préfixe est refusée AVANT tout appel réseau", () => {
    // Une clé publiable (pk_) ou un identifiant d'un autre service échouerait
    // sinon au premier appel API, avec un message que personne ne relie à la
    // configuration.
    // Valeurs neutres : un fragment d'une vraie clé, même tronqué et même
    // publiable, contient l'identifiant du compte Stripe. Il n'a rien à faire
    // dans un dépôt.
    for (const fausse of ["pk_live_EXEMPLE", "mk_EXEMPLE", "abc", ""]) {
      process.env.STRIPE_SECRET_KEY = fausse;
      assert.throws(() => stripe.getStripe(), /STRIPE_SECRET_KEY/, fausse);
    }
    delete process.env.STRIPE_SECRET_KEY;
  });

  test("les clés RESTREINTES sont acceptées : c'est le moindre privilège", () => {
    // Une clé restreinte est une clé secrète à permissions limitées, et la
    // pratique recommandée par Stripe. La refuser poussait à utiliser une clé
    // toute-puissante là où le minimum suffit.
    for (const bonne of ["rk_test_abc", "rk_live_abc", "sk_test_abc", "sk_live_abc"]) {
      process.env.STRIPE_SECRET_KEY = bonne;
      assert.doesNotThrow(() => {
        try { stripe.getStripe(); } catch (e) {
          if (/préfixe/.test(e.message)) throw e;   // seul le préfixe nous intéresse
        }
      }, bonne);
    }
    delete process.env.STRIPE_SECRET_KEY;
  });

  test("le mode test couvre les quatre préfixes", () => {
    for (const [cle, attendu] of [
      ["sk_test_abc", true], ["rk_test_abc", true],
      ["sk_live_abc", false], ["rk_live_abc", false],
    ]) {
      process.env.STRIPE_SECRET_KEY = cle;
      assert.equal(stripe.estEnModeTest(), attendu, cle);
    }
    delete process.env.STRIPE_SECRET_KEY;
  });
});

describe("Signature du webhook", () => {
  test("sans secret configuré, la vérification REFUSE", () => {
    // L'adresse du webhook est publique. Sans signature vérifiée, n'importe
    // qui poste un faux « paiement réussi » et s'active un abonnement.
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.throws(
      () => stripe.verifierSignature("{}", "sig"),
      /STRIPE_WEBHOOK_SECRET absente/,
    );
  });

  test("une signature absente est refusée", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    assert.throws(() => stripe.verifierSignature("{}", null), /Signature absente/);
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
  });

  test("une signature falsifiée est rejetée", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    assert.throws(
      () => stripe.verifierSignature('{"type":"checkout.session.completed"}', "t=1,v1=faux"),
      /signature/i,
    );
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
  });
});

describe("Idempotence des événements", () => {
  test("un même événement n'est traité qu'UNE fois", async () => {
    // Stripe rejoue jusqu'à trois jours tant qu'il n'a pas de 200. Une coupure
    // réseau d'une seconde suffit. Sans ce verrou, un paiement activerait deux
    // abonnements et enverrait deux e-mails de bienvenue.
    repoMod.__resetRepo();
    const repo = repoMod.memoryRepo;
    assert.equal(await repo.marquerEvenementStripe("evt_1", "checkout.session.completed"), true);
    assert.equal(await repo.marquerEvenementStripe("evt_1", "checkout.session.completed"), false);
    assert.equal(await repo.marquerEvenementStripe("evt_2", "checkout.session.completed"), true);
  });

  test("le verrou survit à des rejeux rapprochés", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.memoryRepo;
    const resultats = await Promise.all(
      Array.from({ length: 10 }, () => repo.marquerEvenementStripe("evt_rafale", "x")),
    );
    assert.equal(resultats.filter(Boolean).length, 1, "un seul traitement autorisé");
  });
});
