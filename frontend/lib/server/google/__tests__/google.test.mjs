/**
 * OAuth Google — départ, retour, et lecture des établissements.
 *
 * La plupart de ces tests portent sur ce qu'on REFUSE. Le retour OAuth est une
 * adresse publique : tout ce qui y arrive vient du navigateur, donc d'une source
 * non fiable, et un rattachement accepté à tort donne à un tiers l'accès durable
 * à la fiche Google d'un client.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash, randomBytes } from "node:crypto";

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

let oauth, etat, etablissements;
const CONFIG = {
  clientId: "exemple.apps.googleusercontent.com",
  clientSecret: "secret-de-test",
  redirectUri: "https://mapartisans.com/api/auth/google/callback",
};

before(async () => {
  // Clé de chiffrement requise par crypto.ts, importé par etat.ts.
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  oauth = await import("../oauth.ts");
  etat = await import("../etat.ts");
  etablissements = await import("../etablissements.ts");
});

describe("URL d'autorisation", () => {
  test("demande un jeton de rafraîchissement, sans quoi le worker s'arrête après une heure", () => {
    const url = new URL(
      oauth.construireUrlAutorisation({
        config: CONFIG,
        state: "s",
        codeChallenge: "d",
      }),
    );
    assert.equal(url.searchParams.get("access_type"), "offline");
    // Google n'émet le jeton durable qu'à la PREMIÈRE autorisation : sans
    // `consent`, une reconnexion repartirait sans jeton de rafraîchissement.
    assert.equal(url.searchParams.get("prompt"), "consent");
  });

  test("utilise PKCE en S256, jamais en clair", () => {
    const url = new URL(
      oauth.construireUrlAutorisation({
        config: CONFIG,
        state: "s",
        codeChallenge: "d",
      }),
    );
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("code_challenge"), "d");
  });

  test("ne demande que le périmètre business.manage", () => {
    const url = new URL(
      oauth.construireUrlAutorisation({ config: CONFIG, state: "s", codeChallenge: "d" }),
    );
    assert.equal(url.searchParams.get("scope"), oauth.PERIMETRE);
    assert.ok(!url.searchParams.get("scope").includes(" "), "un seul périmètre");
  });
});

describe("Configuration absente", () => {
  test("nomme la variable manquante plutôt que d'échouer vaguement", () => {
    assert.throws(
      () => oauth.lireConfig({ GOOGLE_CLIENT_SECRET: "x", GOOGLE_REDIRECT_URI: "y" }),
      /GOOGLE_CLIENT_ID/,
    );
  });

  test("googleConfigure est faux tant qu'une seule variable manque", () => {
    assert.equal(oauth.googleConfigure({ GOOGLE_CLIENT_ID: "a" }), false);
    assert.equal(
      oauth.googleConfigure({
        GOOGLE_CLIENT_ID: "a",
        GOOGLE_CLIENT_SECRET: "b",
        GOOGLE_REDIRECT_URI: "c",
      }),
      true,
    );
  });
});

describe("PKCE", () => {
  test("le défi est bien le SHA-256 du vérifieur, en base64url", () => {
    const v = "verifieur-de-test";
    assert.equal(
      etat.defiDepuisVerifieur(v),
      createHash("sha256").update(v).digest("base64url"),
    );
  });

  test("le vérifieur respecte les bornes de la RFC 7636", () => {
    const e = etat.genererEtat("u-1");
    assert.ok(e.codeVerifier.length >= 43 && e.codeVerifier.length <= 128);
    // base64url : aucun caractère à échapper dans une URL.
    assert.match(e.codeVerifier, /^[A-Za-z0-9_-]+$/);
  });

  test("deux départs ne partagent jamais le même état", () => {
    assert.notEqual(etat.genererEtat("u-1").state, etat.genererEtat("u-1").state);
  });
});

describe("Vérification du retour", () => {
  async function cookiePour(e) {
    return etat.chiffrerEtat(e);
  }

  test("accepte un retour légitime", async () => {
    const e = etat.genererEtat("u-1");
    const r = await etat.verifierEtat({
      cookie: await cookiePour(e),
      stateRecu: e.state,
      userId: "u-1",
    });
    assert.equal(r.ok, true);
  });

  test("refuse un retour sans cookie — le cas d'un lien rejoué depuis un autre navigateur", async () => {
    const e = etat.genererEtat("u-1");
    const r = await etat.verifierEtat({
      cookie: undefined,
      stateRecu: e.state,
      userId: "u-1",
    });
    assert.deepEqual(r, { ok: false, raison: "absent" });
  });

  test("refuse un state qui ne correspond pas au cookie", async () => {
    const e = etat.genererEtat("u-1");
    const r = await etat.verifierEtat({
      cookie: await cookiePour(e),
      stateRecu: "state-fabrique",
      userId: "u-1",
    });
    assert.deepEqual(r, { ok: false, raison: "discordant" });
  });

  test("refuse un état expiré", async () => {
    const e = etat.genererEtat("u-1", Date.now() - oauth.VALIDITE_ETAT_MS - 1000);
    const r = await etat.verifierEtat({
      cookie: await cookiePour(e),
      stateRecu: e.state,
      userId: "u-1",
    });
    assert.deepEqual(r, { ok: false, raison: "expire" });
  });

  test("refuse si l'utilisateur a changé entre l'aller et le retour", async () => {
    // Sinon la fiche Google atterrit sur le compte de quelqu'un d'autre.
    const e = etat.genererEtat("u-1");
    const r = await etat.verifierEtat({
      cookie: await cookiePour(e),
      stateRecu: e.state,
      userId: "u-2",
    });
    assert.deepEqual(r, { ok: false, raison: "autre_utilisateur" });
  });

  test("refuse un cookie forgé sans lever d'exception", async () => {
    const r = await etat.verifierEtat({
      cookie: "ceci-n-est-pas-un-etat-chiffre",
      stateRecu: "s",
      userId: "u-1",
    });
    assert.deepEqual(r, { ok: false, raison: "illisible" });
  });
});

describe("Lecture des établissements", () => {
  test("conserve un établissement de zone de service, sans adresse ni coordonnées", () => {
    // Plombier, serrurier, taxi : Google ne publie ni adresse ni latlng. C'est
    // la majorité de nos métiers — les écarter viderait le produit.
    const e = etablissements.normaliserEtablissement({
      name: "locations/1",
      title: "Dépannage Serrure Genève",
    });
    assert.equal(e.locationId, "locations/1");
    assert.equal(e.address, null);
    assert.equal(e.latitude, null);
  });

  test("écarte une entrée sans identifiant, qu'on ne pourrait pas rattacher", () => {
    assert.equal(etablissements.normaliserEtablissement({ title: "Sans nom" }), null);
  });

  test("met l'adresse en une ligne lisible", () => {
    assert.equal(
      etablissements.formaterAdresse({
        addressLines: ["Rue du Rhône 12"],
        postalCode: "1204",
        locality: "Genève",
      }),
      "Rue du Rhône 12, 1204 Genève",
    );
  });

  test("parcourt toutes les pages : une agence dépasse une page", async () => {
    let appels = 0;
    const fetchImpl = async (url) => {
      const s = String(url);
      if (s.includes("accountmanagement")) {
        return new Response(JSON.stringify({ accounts: [{ name: "accounts/1" }] }));
      }
      appels += 1;
      if (!s.includes("pageToken")) {
        return new Response(
          JSON.stringify({
            locations: [{ name: "locations/1", title: "A" }],
            nextPageToken: "suite",
          }),
        );
      }
      return new Response(
        JSON.stringify({ locations: [{ name: "locations/2", title: "B" }] }),
      );
    };
    const r = await etablissements.listerEtablissements("jeton", fetchImpl);
    assert.equal(appels, 2, "la seconde page doit être demandée");
    assert.deepEqual(r.map((e) => e.locationId), ["locations/1", "locations/2"]);
  });

  test("demande readMask, sans quoi Google répond 400", async () => {
    let vue = "";
    const fetchImpl = async (url) => {
      const s = String(url);
      if (s.includes("accountmanagement")) {
        return new Response(JSON.stringify({ accounts: [{ name: "accounts/1" }] }));
      }
      vue = s;
      return new Response(JSON.stringify({ locations: [] }));
    };
    await etablissements.listerEtablissements("jeton", fetchImpl);
    assert.ok(vue.includes("readMask="), `readMask absent de ${vue}`);
  });

  test("un refus de Google remonte avec son statut, pas une liste vide", async () => {
    const fetchImpl = async () => new Response("accès refusé", { status: 403 });
    await assert.rejects(
      () => etablissements.listerEtablissements("jeton", fetchImpl),
      (e) => e.name === "LectureGoogleEchouee" && e.statut === 403,
    );
  });
});

describe("Échange du code", () => {
  test("transmet le vérifieur PKCE, sans quoi Google refuse l'échange", async () => {
    let corps = "";
    const fetchImpl = async (_url, init) => {
      corps = init.body;
      return new Response(JSON.stringify({ access_token: "a", refresh_token: "r" }));
    };
    await oauth.echangerCode({
      config: CONFIG,
      code: "c",
      codeVerifier: "v",
      fetchImpl,
    });
    assert.ok(corps.includes("code_verifier=v"));
  });

  test("une réponse sans access_token est une erreur, pas un succès silencieux", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ scope: "x" }));
    await assert.rejects(
      () => oauth.echangerCode({ config: CONFIG, code: "c", codeVerifier: "v", fetchImpl }),
      /access_token/,
    );
  });

  test("l'absence de jeton de rafraîchissement est signalée par null, pas par une chaîne vide", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ access_token: "a" }));
    const j = await oauth.echangerCode({
      config: CONFIG,
      code: "c",
      codeVerifier: "v",
      fetchImpl,
    });
    assert.equal(j.refreshToken, null);
  });
});
