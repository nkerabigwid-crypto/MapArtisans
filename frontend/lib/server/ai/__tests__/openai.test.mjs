/**
 * Classification des erreurs OpenAI.
 *
 * Trouvé en testant contre un vrai compte à crédit épuisé (pas en le
 * devinant) : OpenAI renvoie 429 aussi bien pour une limitation de débit
 * transitoire que pour un quota épuisé de façon permanente. Ce test fige la
 * distinction pour qu'elle ne régresse pas silencieusement.
 *
 * Exécution : node --test lib/server/ai/__tests__/openai.test.mjs
 */
import { test, describe, before } from "node:test";
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

process.env.OPENAI_API_KEY = "sk-test-placeholder-not-a-real-key";

let openaiMod, resilienceMod, OpenAI;

before(async () => {
  openaiMod = await import("../openai.ts");
  resilienceMod = await import("../../resilience.ts");
  OpenAI = (await import("openai")).default;
});

function fakeApiError(status, type, headers = new Headers()) {
  // Reproduit exactement la forme d'une vraie erreur du SDK, via sa propre
  // fabrique — plus fidèle qu'un objet maison qui devinerait la forme.
  return OpenAI.APIError.generate(status, { error: { type, message: "erreur simulée" } }, "erreur simulée", headers);
}

describe("classifyOpenAiError", () => {
  test("crédit épuisé (429 + insufficient_quota) : PAS rejouable", () => {
    const err = fakeApiError(429, "insufficient_quota");
    assert.throws(
      () => openaiMod.classifyOpenAiError(err),
      (thrown) => !(thrown instanceof resilienceMod.RetryableError),
      "un quota épuisé ne se résout jamais tout seul — le rejouer gaspille du temps",
    );
  });

  test("limitation de débit (429 + rate_limit_exceeded) : rejouable", () => {
    const err = fakeApiError(429, "rate_limit_exceeded");
    assert.throws(
      () => openaiMod.classifyOpenAiError(err),
      (thrown) => thrown instanceof resilienceMod.RetryableError,
    );
  });

  test("erreur serveur (500) : rejouable", () => {
    const err = fakeApiError(500, "server_error");
    assert.throws(
      () => openaiMod.classifyOpenAiError(err),
      (thrown) => thrown instanceof resilienceMod.RetryableError,
    );
  });

  test("clé invalide (401) : jamais rejouable", () => {
    const err = fakeApiError(401, "invalid_api_key");
    assert.throws(
      () => openaiMod.classifyOpenAiError(err),
      (thrown) => !(thrown instanceof resilienceMod.RetryableError),
    );
  });

  test("Retry-After est propagé quand présent", () => {
    const headers = new Headers({ "retry-after": "7" });
    const err = fakeApiError(429, "rate_limit_exceeded", headers);
    try {
      openaiMod.classifyOpenAiError(err);
      assert.fail("aurait dû lever");
    } catch (thrown) {
      assert.equal(thrown.retryAfterMs, 7000);
    }
  });

  test("une erreur qui n'est pas une APIError OpenAI n'est pas transformée", () => {
    const err = new TypeError("panne locale, sans rapport avec OpenAI");
    assert.throws(() => openaiMod.classifyOpenAiError(err), TypeError);
  });
});

describe("Ancrage SEO local : présent sur les avis positifs, absent sur les négatifs", () => {
  const base = {
    reviewerName: "Camille R.",
    comment: "Devis final plus élevé qu'annoncé.",
    tradeType: "plombier",
    city: "Lausanne",
    businessName: "Plomberie Dubois",
  };

  test("avis positif : le prompt demande de citer le métier et la ville", () => {
    const { system } = openaiMod.buildPrompt({ ...base, rating: 5 });
    assert.match(system, /Mentionne naturellement le métier/);
    assert.match(system, /plombier/);
    assert.match(system, /Lausanne/);
  });

  test("avis négatif : le prompt INTERDIT explicitement métier et ville", () => {
    const { system } = openaiMod.buildPrompt({ ...base, rating: 2 });
    assert.doesNotMatch(system, /Mentionne naturellement le métier/);
    assert.match(system, /N'écris NI le métier/);
    assert.match(system, /aucun terme de recherche locale/);
  });

  test("la frontière est à 4 : 3 étoiles suit la branche négative", () => {
    // Un 3 étoiles est une critique. L'y traiter comme un avis positif
    // placerait les mots-clés du métier sous une réserve publique.
    assert.match(openaiMod.buildPrompt({ ...base, rating: 3 }).system, /N'écris NI le métier/);
    assert.match(openaiMod.buildPrompt({ ...base, rating: 4 }).system, /Mentionne naturellement/);
  });

  test("le contexte factuel garde la ville, même en branche négative", () => {
    // La consigne interdit de l'écrire ; elle ne doit pas la cacher au modèle,
    // qui a besoin de savoir de quelle entreprise il parle.
    const { user } = openaiMod.buildPrompt({ ...base, rating: 1 });
    assert.match(user, /Plomberie Dubois \(plombier, Lausanne\)/);
  });

  test("aucune branche ne laisse le modèle signer au nom de l'outil", () => {
    for (const rating of [1, 3, 4, 5]) {
      assert.match(
        openaiMod.buildPrompt({ ...base, rating }).system,
        /Ne cite jamais le nom d'un logiciel/,
      );
    }
  });

  test("signature : autorisée sur un avis positif, interdite sur un négatif", () => {
    // La raison sociale « Plomberie Dubois » contient le mot-clé métier. Laisser
    // le modèle signer sous un avis négatif réintroduirait par la signature ce
    // que la règle SEO retire du corps du texte — constaté sur le vrai modèle.
    assert.match(openaiMod.buildPrompt({ ...base, rating: 5 }).system, /Si tu signes/);
    const negatif = openaiMod.buildPrompt({ ...base, rating: 2 }).system;
    assert.doesNotMatch(negatif, /Si tu signes/);
    assert.match(negatif, /Ne signe pas et n'écris pas la raison sociale/);
  });

  test("avis « étoiles seules » : la consigne dédiée n'apparaît que côté positif", () => {
    const positif = openaiMod.buildPrompt({ ...base, rating: 5, comment: null });
    assert.match(positif.system, /note sans texte/);
    assert.match(positif.user, /aucun texte, le client a laisse une note seule/);
  });
});
