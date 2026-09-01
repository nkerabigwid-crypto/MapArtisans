/**
 * Essai gratuit.
 *
 * Le site annonçait « essai gratuit de 7 jours, sans carte bancaire » et rien
 * ne l'implémentait : ni date de fin, ni accès accordé, ni coupure. Ces tests
 * portent surtout sur la COUPURE — c'est elle qui coûte de l'argent quand elle
 * manque, chaque avis traité étant un appel OpenAI facturé et chaque rapport un
 * SMS payé.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  accesAutorise,
  finEssai,
  joursRestants,
  messageBlocage,
  DUREE_ESSAI_JOURS,
} from "../essai.ts";

const JOUR = 24 * 3600 * 1000;
const T0 = new Date("2026-09-01T10:00:00Z");

describe("Durée", () => {
  test("sept jours, et pas trois", () => {
    // Le rapport hebdomadaire est l'argument central : sur trois jours,
    // l'artisan ne le recevrait jamais.
    assert.equal(DUREE_ESSAI_JOURS, 7);
  });

  test("la fin d'essai tombe sept jours plus tard", () => {
    assert.equal(finEssai(T0).getTime(), T0.getTime() + 7 * JOUR);
  });
});

describe("Jours restants", () => {
  test("arrondit au SUPÉRIEUR", () => {
    // Deux heures restantes affichent « 1 jour » : annoncer zéro à quelqu'un
    // qui a encore accès le pousse à croire que le produit s'est déjà coupé.
    const fin = new Date(T0.getTime() + 2 * 3600 * 1000);
    assert.equal(joursRestants(fin, T0), 1);
  });

  test("zéro une fois la date passée", () => {
    assert.equal(joursRestants(new Date(T0.getTime() - JOUR), T0), 0);
  });

  test("null hors essai", () => {
    assert.equal(joursRestants(null, T0), null);
  });
});

describe("Accès", () => {
  test("un essai en cours ouvre l'accès", () => {
    const v = accesAutorise(
      { subscriptionStatus: "trialing", trialEndsAt: new Date(T0.getTime() + 5 * JOUR), gracePeriodEndsAt: null },
      T0,
    );
    assert.equal(v.ok, true);
    assert.equal(v.joursRestants, 5);
    assert.equal(v.bientotFini, false);
  });

  test("un essai EXPIRÉ ferme l'accès", () => {
    // Sans cette coupure, un inscrit d'un jour continuerait de générer des
    // réponses OpenAI et de consommer des SMS indéfiniment, sans jamais payer.
    const v = accesAutorise(
      { subscriptionStatus: "trialing", trialEndsAt: new Date(T0.getTime() - JOUR), gracePeriodEndsAt: null },
      T0,
    );
    assert.equal(v.ok, false);
    assert.equal(v.motif, "essai-termine");
  });

  test("les deux derniers jours sont signalés avant la coupure", () => {
    const v = accesAutorise(
      { subscriptionStatus: "trialing", trialEndsAt: new Date(T0.getTime() + 2 * JOUR), gracePeriodEndsAt: null },
      T0,
    );
    assert.equal(v.ok, true);
    assert.equal(v.bientotFini, true);
  });

  test("un abonné actif n'a pas de compte à rebours", () => {
    const v = accesAutorise(
      { subscriptionStatus: "active", trialEndsAt: null, gracePeriodEndsAt: null },
      T0,
    );
    assert.equal(v.ok, true);
    assert.equal(v.joursRestants, null);
  });

  test("un impayé garde l'accès pendant le délai de grâce", () => {
    // Il a déjà payé plusieurs mois : le couper n'accélère pas le paiement et
    // abîme la relation.
    const v = accesAutorise(
      { subscriptionStatus: "past_due", trialEndsAt: null, gracePeriodEndsAt: new Date(T0.getTime() + 3 * JOUR) },
      T0,
    );
    assert.equal(v.ok, true);
  });

  test("un impayé au-delà du délai de grâce est coupé", () => {
    const v = accesAutorise(
      { subscriptionStatus: "past_due", trialEndsAt: null, gracePeriodEndsAt: new Date(T0.getTime() - JOUR) },
      T0,
    );
    assert.equal(v.ok, false);
    assert.equal(v.motif, "resilie");
  });

  test("un compte résilié est fermé", () => {
    const v = accesAutorise(
      { subscriptionStatus: "canceled", trialEndsAt: null, gracePeriodEndsAt: null },
      T0,
    );
    assert.equal(v.ok, false);
    assert.equal(v.motif, "resilie");
  });

  test("un statut `incomplete` ne donne AUCUN accès", () => {
    // Comptes antérieurs à la migration : ni essai, ni paiement.
    const v = accesAutorise(
      { subscriptionStatus: "incomplete", trialEndsAt: null, gracePeriodEndsAt: null },
      T0,
    );
    assert.equal(v.ok, false);
    assert.equal(v.motif, "jamais-active");
  });

  test("un `trialing` SANS date de fin ne donne pas un accès illimité", () => {
    // Le piège : un statut posé à la main sans date ouvrirait le produit pour
    // toujours. On refuse plutôt que de faire confiance au statut seul.
    const v = accesAutorise(
      { subscriptionStatus: "trialing", trialEndsAt: null, gracePeriodEndsAt: null },
      T0,
    );
    assert.equal(v.ok, false);
  });
});

describe("Messages", () => {
  test("chaque motif a un message qui dit quoi faire", () => {
    for (const motif of ["essai-termine", "resilie", "jamais-active"]) {
      const m = messageBlocage(motif);
      assert.ok(m.length > 20, `message trop court pour ${motif}`);
    }
  });

  test("la fin d'essai rassure sur ce qui est conservé", () => {
    // Un artisan qui craint de perdre son travail hésite à convertir.
    assert.match(messageBlocage("essai-termine"), /conserv/i);
  });
});
