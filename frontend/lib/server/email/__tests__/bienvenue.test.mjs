/**
 * Message de bienvenue.
 *
 * Deux situations, un seul module : l'inscription — le compte existe, rien
 * n'est payé — et le PAIEMENT, où le client vient d'engager de l'argent. Le
 * meme texte pour les deux disait « votre compte est actif » a quelqu'un qui
 * venait de payer 49 CHF sans jamais nommer ce qu'il avait achete.
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

let composer;
before(async () => {
  ({ composeWelcomeEmail: composer } = await import("../welcome.ts"));
});

const LIEN = "https://mapartisans.com/connexion/magique?token=abc";

describe("Inscription — sans paiement", () => {
  test("ne parle NI d'abonnement NI de prix", () => {
    // Inventer un abonnement a quelqu'un qui n'a rien paye serait faux, et
    // l'inquieterait a juste titre.
    const m = composer({ magicLink: LIEN });
    assert.ok(!m.text.includes("CHF"), "aucun montant");
    assert.ok(!m.subject.includes("abonnement"));
    assert.ok(m.text.includes(LIEN), "le lien reste present");
  });
});

describe("Paiement — avec abonnement", () => {
  const m = () =>
    composer({
      magicLink: LIEN,
      abonnement: { palier: "Essentiel", montantCentimes: 9900 },
    });

  test("nomme le palier et le prix", () => {
    const msg = m();
    assert.ok(msg.text.includes("Essentiel"), "le palier doit etre nomme");
    assert.ok(msg.text.includes("99.00 CHF"), "le prix doit etre lisible");
    assert.ok(msg.html.includes("Essentiel"));
    assert.ok(msg.html.includes("99.00 CHF"));
  });

  test("l'objet dit qu'il s'agit de l'abonnement", () => {
    // C'est la ligne que le client voit sans ouvrir, et celle qu'il cherchera
    // dans sa boite six mois plus tard.
    assert.ok(m().subject.includes("Essentiel"));
    assert.ok(m().subject.includes("abonnement"));
  });

  test("annonce la facture, qui arrive separement", () => {
    // Sans cette phrase, le client attend une piece jointe qui n'est pas la et
    // croit a un oubli.
    assert.ok(m().text.includes("facture"));
    assert.ok(m().html.includes("facture"));
  });

  test("le montant s'affiche en francs, jamais en centimes", () => {
    const msg = composer({
      magicLink: LIEN,
      abonnement: { palier: "Basique", montantCentimes: 4900 },
    });
    assert.ok(msg.text.includes("49.00 CHF"));
    assert.ok(!msg.text.includes("4900"), "les centimes bruts ne doivent pas fuiter");
  });

  test("garde le lien magique et sa duree de validite", () => {
    // Confirmer l'abonnement ne doit pas faire perdre la raison d'etre du
    // message : ouvrir le produit.
    const msg = m();
    assert.ok(msg.text.includes(LIEN));
    assert.ok(msg.text.includes("15 minutes"));
  });
});
