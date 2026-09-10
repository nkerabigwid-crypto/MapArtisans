/**
 * Alerte de solde fal.ai.
 *
 * Elle existe contre l'oubli humain : sans elle, un compte épuisé se découvre
 * en constatant qu'aucune vidéo n'est partie depuis trois semaines.
 *
 * Ce qui est vérifié ici tient surtout à deux choses : qu'une alerte en panne
 * ne fasse jamais échouer la génération qu'elle accompagne, et qu'un solde
 * vide n'envoie pas un SMS par vidéo refusée — plusieurs par heure, le jour
 * précis où l'on ne veut plus dépenser.
 *
 * Exécution : node --test lib/server/video/__tests__/alerte.test.mjs
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

const { alerterSolde, composerAlerte, seuilFranchi, SEUIL_ALERTE } =
  await import("../alerte.ts");
const { assertAffordable } = await import("../../sms/twilio.ts");

const envoyeur = () => {
  const envoyes = [];
  return { envoyes, send: async (to, body) => void envoyes.push({ to, body }) };
};

describe("Seuil", () => {
  test("il se déclenche à 80 % de l'enveloppe, pas à l'épuisement", () => {
    assert.equal(seuilFranchi({ depenseUsd: 39, enveloppeUsd: 50 }), false);
    assert.equal(seuilFranchi({ depenseUsd: 40, enveloppeUsd: 50 }), true);
    assert.equal(SEUIL_ALERTE, 0.8);
  });

  test("sans enveloppe déclarée, aucune alerte préventive", () => {
    // Zéro n'est pas « alerte tout de suite » : c'est « je n'ai rien déclaré ».
    assert.equal(seuilFranchi({ depenseUsd: 100, enveloppeUsd: 0 }), false);
  });
});

describe("Message", () => {
  test("il tient en UN segment SMS, dans les deux cas", () => {
    // Deux segments coûtent le double et signalent qu'on écrit trop pour une
    // alerte censée se lire d'un coup d'œil.
    for (const corps of [
      composerAlerte("seuil", { depenseUsd: 41.5, enveloppeUsd: 50 }),
      composerAlerte("epuise", { depenseUsd: 0, enveloppeUsd: 0 }),
    ]) {
      // assertAffordable lève au-delà d'un segment : c'est exactement le
      // garde-fou utilisé en production par alerterSolde.
      assert.doesNotThrow(() => assertAffordable(corps), corps);
    }
  });

  test("il dit quoi faire, et que rien n'est perdu", () => {
    const epuise = composerAlerte("epuise", { depenseUsd: 0, enveloppeUsd: 0 });
    assert.match(epuise, /fal\.ai/);
    // Rassurer explicitement : les périodes sont rendues, pas brûlées.
    assert.match(epuise, /aucune periode n'est perdue/i);

    const seuil = composerAlerte("seuil", { depenseUsd: 41.5, enveloppeUsd: 50 });
    assert.match(seuil, /41\.50/, "la dépense réelle doit figurer");
    assert.match(seuil, /8\.50/, "le reste aussi");
  });
});

describe("Envoi", () => {
  test("rien n'est envoyé sans destinataire", async () => {
    const s = envoyeur();
    const envoye = await alerterSolde("epuise", { depenseUsd: 0, enveloppeUsd: 0 }, {
      sender: s,
      destinataire: "",
    });
    assert.equal(envoye, false);
    assert.equal(s.envoyes.length, 0);
  });

  test("une seule alerte par jour et par motif", async () => {
    let memoire = false;
    const s = envoyeur();
    const deps = {
      sender: s,
      destinataire: "+41790000000",
      dejaEnvoyee: async () => memoire,
      marquerEnvoyee: async () => void (memoire = true),
    };
    for (let i = 0; i < 5; i++) {
      await alerterSolde("epuise", { depenseUsd: 0, enveloppeUsd: 0 }, deps);
    }
    assert.equal(s.envoyes.length, 1, "un SMS par vidéo refusée serait absurde");
  });

  test("une alerte en panne ne fait JAMAIS échouer ce qui l'a déclenchée", async () => {
    // Transformer un avertissement en panne serait le pire des deux mondes.
    const envoye = await alerterSolde("epuise", { depenseUsd: 0, enveloppeUsd: 0 }, {
      destinataire: "+41790000000",
      sender: {
        send: async () => {
          throw new Error("Twilio indisponible");
        },
      },
    });
    assert.equal(envoye, false, "elle rend false, elle ne lève pas");
  });
});
