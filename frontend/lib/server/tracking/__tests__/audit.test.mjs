/**
 * Audit public : cache, quota, mot-clé.
 *
 * Ce qui est vérifié ici tient la facture Google. La résolution d'un
 * établissement est un appel payant sur une page PUBLIQUE : sans cache ni
 * quota, un robot qui parcourt le site la déclenche autant de fois qu'il
 * charge la page.
 *
 * Ni Redis ni réseau : les deux sont injectés.
 *
 * Exécution : node --test lib/server/tracking/__tests__/audit.test.mjs
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

const { auditPublic, cleCache, motCleParDefaut, QuotaAuditDepasse, QUOTA_PAR_JOUR } =
  await import("../audit.ts");

/** Redis factice : un Map, avec le comptage de incr. */
function redisFactice() {
  const m = new Map();
  return {
    m,
    async get(k) {
      return m.get(k) ?? null;
    },
    async set(k, v) {
      m.set(k, v);
    },
    async incr(k) {
      const n = (Number(m.get(k)) || 0) + 1;
      m.set(k, String(n));
      return n;
    },
    async expire() {},
  };
}

function deps(redis, compteurs = { resolutions: 0, releves: 0 }) {
  return {
    redis,
    compteurs,
    resoudre: async () => {
      compteurs.resolutions++;
      return {
        placeId: "ChIJabc",
        nom: "SOS HOME Sàrl",
        adresse: "Rue du Test 1, Genève",
        latitude: 46.19,
        longitude: 6.14,
      };
    },
    relever: async () => {
      compteurs.releves++;
      return { points: [{ label: "A1", area: "Plainpalais", lat: 46.19, lng: 6.14, position: 2, topCompetitorPlaceId: null }], echecs: 0 };
    },
  };
}

const DEMANDE = { nom: "SOS HOME", ville: "Genève", motCle: "plombier genève" };

describe("Cache", () => {
  test("le deuxième appel identique ne coûte RIEN", async () => {
    // LE test. Sans lui, recharger la page facture un appel de plus.
    const redis = redisFactice();
    const d = deps(redis);

    const premier = await auditPublic(DEMANDE, "ip-1", d);
    assert.equal(premier.duCache, false);
    assert.equal(d.compteurs.resolutions, 1);

    const second = await auditPublic(DEMANDE, "ip-1", d);
    assert.equal(second.duCache, true);
    assert.equal(d.compteurs.resolutions, 1, "aucune résolution supplémentaire");
    assert.equal(d.compteurs.releves, 1, "aucun relevé supplémentaire");
  });

  test("la casse et les espaces ne créent pas deux entrées", async () => {
    // « Dupont  SA » et « dupont sa » sont le même établissement : les
    // facturer deux fois serait une fuite silencieuse.
    assert.equal(
      cleCache({ nom: "SOS  HOME", ville: "Genève" }, "Plombier Genève"),
      cleCache({ nom: "sos home", ville: " genève " }, "plombier genève"),
    );
  });

  test("le cache est consulté AVANT le quota", async () => {
    // Un visiteur qui recharge la même page ne doit pas épuiser son droit de
    // tirage : il ne consomme rien.
    const redis = redisFactice();
    const d = deps(redis);
    for (let i = 0; i < QUOTA_PAR_JOUR + 3; i++) {
      await auditPublic(DEMANDE, "ip-1", d);
    }
    assert.equal(d.compteurs.resolutions, 1);
  });
});

describe("Quota par visiteur", () => {
  test("au-delà du quota, un message lisible et non une erreur technique", async () => {
    const redis = redisFactice();
    const d = deps(redis);
    // Des établissements TOUS différents, pour ne jamais toucher le cache.
    for (let i = 0; i < QUOTA_PAR_JOUR; i++) {
      await auditPublic({ nom: `Entreprise ${i}`, ville: "Genève" }, "ip-2", d);
    }
    await assert.rejects(
      auditPublic({ nom: "Une de trop", ville: "Genève" }, "ip-2", d),
      (e) => e instanceof QuotaAuditDepasse && /Revenez demain/.test(e.message),
    );
    assert.equal(d.compteurs.resolutions, QUOTA_PAR_JOUR, "aucun appel au-delà du quota");
  });

  test("le quota est par visiteur, pas global", async () => {
    const redis = redisFactice();
    const d = deps(redis);
    for (let i = 0; i < QUOTA_PAR_JOUR; i++) {
      await auditPublic({ nom: `Entreprise ${i}`, ville: "Genève" }, "ip-3", d);
    }
    // Un autre visiteur ne doit pas être puni pour le premier.
    await assert.doesNotReject(auditPublic({ nom: "Autre", ville: "Genève" }, "ip-4", d));
  });
});

describe("Mot-clé", () => {
  test("par défaut, c'est le métier et la ville — pas le nom", async () => {
    // Chercher le nom de l'entreprise donnerait toujours la première place, et
    // un audit sans le moindre intérêt.
    assert.equal(motCleParDefaut({ nom: "Plomberie Dupont SA", ville: "Genève" }), "Plomberie Genève");
  });

  test("celui de l'artisan prime quand il est fourni", () => {
    assert.equal(
      motCleParDefaut({ nom: "Dupont", ville: "Genève", motCle: "dépannage urgence" }),
      "dépannage urgence",
    );
  });
});
