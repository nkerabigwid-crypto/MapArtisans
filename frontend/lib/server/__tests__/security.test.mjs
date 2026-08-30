/**
 * Tests du noyau de sécurité.
 *
 * Exécution : node --test lib/server/__tests__/security.test.mjs
 *
 * Les modules testés importent `server-only`, qui refuse de se charger hors
 * d'un rendu serveur Next. On le neutralise ici — c'est une garde destinée aux
 * composants client, sans objet dans un test Node.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Deux ajustements de résolution, tous deux propres au contexte de test :
//   · `server-only` est remplacé par un module vide — cette garde vise les
//     composants client et n'a pas d'objet ici ;
//   · les imports relatifs sans extension (`./password`) reçoivent `.ts`, que
//     TypeScript accepte mais que le résolveur ESM de Node exige.
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(spec, ctx, next) {
        if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
        if (spec.startsWith(".") && !/\\.[cm]?[jt]s$/.test(spec)) {
          try { return await next(spec + ".ts", ctx); } catch {}
        }
        return next(spec, ctx);
      }
    `),
  pathToFileURL("./"),
);

process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.SESSION_SECRET = "x".repeat(48);

let crypto_, password_, session_, repo_;

before(async () => {
  crypto_ = await import("../crypto.ts");
  password_ = await import("../password.ts");
  session_ = await import("../session.ts");
  repo_ = await import("../repo.ts");
});

// ---------------------------------------------------------------------------
describe("Chiffrement des jetons Google (AES-256-GCM)", () => {
  test("un jeton chiffré se redéchiffre à l'identique", async () => {
    const clair = "ya29.a0AfH6SMBexemple-de-jeton-google";
    const chiffre = await crypto_.encryptToken(clair);
    assert.notEqual(chiffre, clair, "le jeton ne doit pas apparaître en clair");
    assert.equal(await crypto_.decryptToken(chiffre), clair);
  });

  test("deux chiffrements du même jeton diffèrent (IV unique)", async () => {
    const a = await crypto_.encryptToken("meme-valeur");
    const b = await crypto_.encryptToken("meme-valeur");
    assert.notEqual(a, b, "un IV réutilisé casserait GCM");
    assert.equal(await crypto_.decryptToken(a), await crypto_.decryptToken(b));
  });

  test("un texte chiffré altéré est rejeté, pas déchiffré silencieusement", async () => {
    const chiffre = await crypto_.encryptToken("valeur-sensible");
    const parts = chiffre.split(".");

    // On modifie un OCTET décodé, au milieu du tampon — pas le dernier
    // caractère base64url du texte. Rejouer ce test a fini par échouer une
    // fois sur plusieurs milliers : modifier le tout dernier caractère peut,
    // selon l'alignement des groupes de 4 caractères, ne toucher que des bits
    // de bourrage que le décodage ignore — l'octet réel reste alors
    // inchangé, et le test ne prouve accidentellement rien. Un octet du
    // milieu n'a pas cette zone grise.
    const bytes = Buffer.from(parts[2], "base64url");
    const mid = Math.floor(bytes.length / 2);
    bytes[mid] ^= 0xff;
    const altere = bytes.toString("base64url");

    await assert.rejects(() => crypto_.decryptToken(`${parts[0]}.${parts[1]}.${altere}`));
  });

  test("une version inconnue est refusée", async () => {
    await assert.rejects(() => crypto_.decryptToken("v9.AAAA.BBBB"), /version/i);
  });

  test("une clé de mauvaise taille est refusée au chargement", async () => {
    const sauve = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    crypto_.__resetKeyCache();
    await assert.rejects(() => crypto_.encryptToken("x"), /32 octets/);
    process.env.TOKEN_ENCRYPTION_KEY = sauve;
    crypto_.__resetKeyCache();
  });
});

// ---------------------------------------------------------------------------
describe("Mots de passe (scrypt)", () => {
  test("le bon mot de passe est accepté, un autre non", async () => {
    const h = await password_.hashPassword("motdepasse-correct-2026");
    assert.equal(await password_.verifyPassword("motdepasse-correct-2026", h), true);
    assert.equal(await password_.verifyPassword("motdepasse-incorrect", h), false);
  });

  test("deux comptes au même mot de passe ont des hachages différents (sel)", async () => {
    const a = await password_.hashPassword("identique-pour-les-deux");
    const b = await password_.hashPassword("identique-pour-les-deux");
    assert.notEqual(a, b, "sans sel, une table précalculée casse les deux d'un coup");
  });

  test("le hachage ne contient jamais le mot de passe", async () => {
    const h = await password_.hashPassword("secret-tres-reconnaissable");
    assert.ok(!h.includes("secret-tres-reconnaissable"));
  });

  test("un mot de passe trop court est refusé", async () => {
    await assert.rejects(() => password_.hashPassword("court"), /12 caractères/);
  });

  test("un hachage malformé est refusé sans lever", async () => {
    assert.equal(await password_.verifyPassword("x", "n-importe-quoi"), false);
    assert.equal(await password_.verifyPassword("x", ""), false);
  });
});

// ---------------------------------------------------------------------------
describe("Sessions signées", () => {
  test("une session émise est reconnue", async () => {
    const t = await session_.createSession("u-001");
    const p = await session_.verifySession(t);
    assert.equal(p?.uid, "u-001");
  });

  test("une signature falsifiée est rejetée", async () => {
    const t = await session_.createSession("u-001");
    const [corps] = t.split(".");
    assert.equal(await session_.verifySession(`${corps}.signature-inventee`), null);
  });

  test("modifier l'identifiant invalide la session", async () => {
    const t = await session_.createSession("u-001");
    const [, sig] = t.split(".");
    const faux = Buffer.from(JSON.stringify({ uid: "u-002", exp: 9999999999 }))
      .toString("base64url");
    assert.equal(await session_.verifySession(`${faux}.${sig}`), null,
      "un utilisateur ne doit pas pouvoir se faire passer pour un autre");
  });

  test("une session expirée est rejetée", async () => {
    const perimee = Buffer.from(JSON.stringify({ uid: "u-001", exp: 1 })).toString("base64url");
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(process.env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(perimee));
    const b64 = Buffer.from(new Uint8Array(sig)).toString("base64url");
    assert.equal(await session_.verifySession(`${perimee}.${b64}`), null,
      "l'expiration doit être vérifiée dans la charge signée, pas seulement par le cookie");
  });

  test("une absence de jeton renvoie null sans lever", async () => {
    assert.equal(await session_.verifySession(undefined), null);
    assert.equal(await session_.verifySession(""), null);
    assert.equal(await session_.verifySession("nimportequoi"), null);
  });

  test("le cookie est httpOnly et sameSite=lax", () => {
    const o = session_.sessionCookie.options();
    assert.equal(o.httpOnly, true, "sinon un script injecté lit la session");
    assert.equal(o.sameSite, "lax");
  });
});

// ---------------------------------------------------------------------------
describe("Isolation entre locataires", () => {
  test("un utilisateur ne voit que ses propres fiches", async () => {
    const r = repo_.getRepo();
    const a = await r.listProfilesForUser("u-001");
    const b = await r.listProfilesForUser("u-002");
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.notEqual(a[0].id, b[0].id);
  });

  test("accéder à la fiche d'un autre renvoie null", async () => {
    const r = repo_.getRepo();
    assert.ok(await r.findProfileForUser("u-001", "g-001"), "sa propre fiche est accessible");
    assert.equal(await r.findProfileForUser("u-001", "g-002"), null,
      "la fiche d'un autre locataire ne doit jamais être renvoyée");
    assert.equal(await r.findProfileForUser("u-002", "g-001"), null);
  });

  test("une fiche inexistante renvoie null, pas une erreur", async () => {
    const r = repo_.getRepo();
    assert.equal(await r.findProfileForUser("u-001", "g-inexistante"), null);
  });

  test("la casse de l'e-mail ne crée pas deux comptes", async () => {
    const r = repo_.getRepo();
    const a = await r.findUserByEmail("demo@mapartisan.ch");
    const b = await r.findUserByEmail("  DEMO@MapArtisan.CH  ");
    assert.equal(a?.id, b?.id);
  });
});

describe("Liens magiques (connexion sans mot de passe)", () => {
  let magic, repoMod2;
  before(async () => {
    magic = await import("../magicLink.ts");
    repoMod2 = await import("../repo.ts");
  });

  test("le jeton en clair n'est JAMAIS ce qui est stocké", async () => {
    // Une fuite de base ne doit pas livrer des identifiants de connexion.
    const { token, record } = await magic.createMagicLink("u-001");
    assert.notEqual(record.tokenHash, token);
    assert.match(record.tokenHash, /^[0-9a-f]{64}$/, "SHA-256 hexadécimal");
    assert.equal(record.tokenHash, await magic.hashMagicToken(token));
  });

  test("deux jetons successifs diffèrent, et sont assez longs pour ne pas être devinés", async () => {
    const a = await magic.createMagicLink("u-001");
    const b = await magic.createMagicLink("u-001");
    assert.notEqual(a.token, b.token);
    // 32 octets en base64url sans remplissage.
    assert.ok(a.token.length >= 43, `jeton trop court : ${a.token.length}`);
  });

  test("un lien valide ouvre la session du bon utilisateur", async () => {
    repoMod2.__resetRepo();
    const repo = repoMod2.getRepo();
    const { token, record } = await magic.createMagicLink("u-001");
    await repo.saveMagicLink(record);

    const trouve = await repo.consumeMagicLink(await magic.hashMagicToken(token));
    const verdict = magic.evaluerLien(trouve);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.userId, "u-001");
  });

  test("USAGE UNIQUE : la seconde consommation du même jeton est refusée", async () => {
    // Cas réel : les prévisualiseurs de lien (Gmail, WhatsApp) ouvrent l'URL
    // avant l'utilisateur. Le second passage doit échouer, pas le premier.
    repoMod2.__resetRepo();
    const repo = repoMod2.getRepo();
    const { token, record } = await magic.createMagicLink("u-001");
    await repo.saveMagicLink(record);
    const hash = await magic.hashMagicToken(token);

    assert.equal(magic.evaluerLien(await repo.consumeMagicLink(hash)).ok, true);

    const second = magic.evaluerLien(await repo.consumeMagicLink(hash));
    assert.equal(second.ok, false);
    assert.equal(second.raison, "deja-utilise");
  });

  test("un lien périmé est refusé, même intact et jamais utilisé", async () => {
    repoMod2.__resetRepo();
    const repo = repoMod2.getRepo();
    const t0 = Date.now();
    const { token, record } = await magic.createMagicLink("u-001", t0);
    await repo.saveMagicLink(record);

    const hash = await magic.hashMagicToken(token);
    const apres = t0 + 15 * 60 * 1000 + 1; // une milliseconde après l'échéance
    const verdict = magic.evaluerLien(await repo.consumeMagicLink(hash, apres), apres);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.raison, "expire");
  });

  test("un jeton inventé ne correspond à rien", async () => {
    repoMod2.__resetRepo();
    const repo = repoMod2.getRepo();
    const hash = await magic.hashMagicToken("jeton-fabrique-de-toutes-pieces");
    assert.equal(magic.evaluerLien(await repo.consumeMagicLink(hash)).ok, false);
  });

  test("le jeton ne part jamais en clair sur le réseau : http est refusé", async () => {
    const { token } = await magic.createMagicLink("u-001");
    assert.throws(() => magic.magicLinkUrl("http://mapartisans.com", token), /jamais transiter en clair/);
    // localhost reste autorisé, sinon le développement devient impraticable.
    assert.match(magic.magicLinkUrl("http://localhost:3000", token), /^http:\/\/localhost:3000\/connexion\/lien\//);
  });

  test("le jeton est dans le CHEMIN, pas en paramètre de requête (fuite par Referer)", async () => {
    const { token } = await magic.createMagicLink("u-001");
    const url = new URL(magic.magicLinkUrl("https://mapartisans.com", token));
    assert.equal(url.search, "", "aucun paramètre de requête");
    assert.ok(url.pathname.startsWith("/connexion/lien/"));
  });
});

describe("Grille tarifaire", () => {
  let data;
  before(async () => { data = await import("../../data.ts"); });

  test("deux paliers, à 49 et 89 CHF, tous deux achetables en ligne", () => {
    assert.deepEqual(data.PLANS.map((p) => p.id), ["essentiel", "pro"]);
    assert.deepEqual(data.PLANS.map((p) => p.amount), [49, 89]);
  });

  test("aucun palier revendeur : un seul prix public, le même pour tous", () => {
    // Retiré le 29 août 2026. Revendu avec la marge d'une agence, le même
    // logiciel arrivait plus cher chez l'artisan que sur notre page de tarifs.
    // Ce test empêche qu'un palier à tarif négocié revienne sans décision.
    assert.equal(data.PLANS.length, 2);
    for (const plan of data.PLANS) {
      assert.equal(typeof plan.amount, "number");
      assert.ok(plan.amount > 0, "tout palier affiche un prix ferme");
    }
  });

  test("un seul palier porte la recommandation", () => {
    assert.equal(data.PLANS.filter((p) => p.recommended).length, 1);
  });

  test("aucun palier ne promet de trier les avis selon leur note", () => {
    // Google interdit explicitement de « discourage or prohibit negative
    // reviews, or selectively solicit positive reviews ». Une formule comme
    // « QR code anti-avis négatifs » décrit cette pratique et exposerait les
    // fiches de nos clients à une sanction. Elle a figuré ici : ce test existe
    // pour qu'elle ne revienne pas.
    const interdits = /anti[- ]avis|filtrer? les avis|avis négatifs?\s+(bloqu|évit|empêch)/i;
    for (const plan of data.PLANS) {
      for (const f of plan.features) {
        assert.doesNotMatch(f, interdits, `palier ${plan.id} : « ${f} »`);
      }
    }
  });
});

describe("Plafond d'établissements par formule", () => {
  let data, repoMod3;
  before(async () => {
    data = await import("../../data.ts");
    repoMod3 = await import("../repo.ts");
  });

  test("une formule solo refuse la deuxième fiche", () => {
    for (const id of ["essentiel", "pro"]) {
      assert.equal(data.peutAjouterFiche(id, 0).ok, true, `${id} : la première passe`);
      const refus = data.peutAjouterFiche(id, 1);
      assert.equal(refus.ok, false, `${id} : la seconde est refusée`);
      assert.equal(refus.plafond, 1);
      assert.match(refus.message, /un seul établissement/);
    }
  });

  test("le plafond annoncé sur la carte correspond au plafond appliqué", () => {
    // Le chiffre affiché et le chiffre appliqué doivent rester le même, sans
    // quoi on vend un établissement et on en autorise l'infini.
    const essentiel = data.PLANS.find((p) => p.id === "essentiel");
    assert.equal(essentiel.maxProfiles, 1);
    assert.ok(
      essentiel.features.some((f) => f.includes("1 établissement")),
      "la carte doit annoncer le plafond réellement appliqué",
    );
  });

  test("une formule inconnue refuse, elle n'ouvre pas les vannes", () => {
    // Cas réel : un palier retiré du catalogue alors que des comptes le portent.
    const refus = data.peutAjouterFiche("palier-supprime", 0);
    assert.equal(refus.ok, false);
  });

  test("le comptage suit l'utilisateur, pas l'entreprise", async () => {
    // Une agence détient plusieurs entreprises : le plafond porte sur le total.
    repoMod3.__resetRepo();
    const repo = repoMod3.getRepo();
    const n = await repo.countProfilesForUser("u-001");
    assert.equal(n, (await repo.listProfilesForUser("u-001")).length);
    assert.equal(await repo.countProfilesForUser("inconnu"), 0);
  });
});

describe("QR code de collecte d'avis", () => {
  let qr;
  before(async () => { qr = await import("../qr.ts"); });

  test("le lien pointe DIRECTEMENT vers Google, sans page intermédiaire", () => {
    // Une page intercalaire qui trierait les clients selon la note qu'ils
    // s'apprêtent à donner est du review gating, explicitement interdit par
    // Google. La sanction tombe sur la fiche de l'artisan, pas sur nous.
    const url = qr.reviewUrl("ChIJN1t_tDeuEmsRUsoyG83frY4");
    assert.match(url, /^https:\/\/search\.google\.com\/local\/writereview\?placeid=/);
    assert.doesNotMatch(url, /mapartisans/i, "aucun passage par notre serveur");
  });

  test("un place_id vide échoue bruyamment plutôt que de produire un lien mort", () => {
    // Le QR code part à l'imprimeur : une erreur silencieuse se découvre sur
    // des centaines d'autocollants déjà collés.
    assert.throws(() => qr.reviewUrl("   "), /place_id manquant/);
  });

  test("le place_id est encodé : un identifiant exotique ne casse pas l'URL", () => {
    assert.match(qr.reviewUrl("abc/def?x=1"), /placeid=abc%2Fdef%3Fx%3D1$/);
  });

  test("le SVG produit est bien un QR code vectoriel", async () => {
    const svg = await qr.generateReviewQr("ChIJN1t_tDeuEmsRUsoyG83frY4");
    assert.match(svg, /^<svg/);
    assert.match(svg, /viewBox/, "vectoriel : il doit s'agrandir sans perte pour l'impression");
    assert.ok(svg.includes("#123f6d"), "couleur MapArtisans par défaut");
  });

  test("une couleur trop pâle est REFUSÉE : le code serait illisible imprimé", async () => {
    // Le garde-fou qui compte le jour où une couleur de marque arrive : un
    // jaune ou un bleu clair produirait des milliers d'autocollants morts.
    await assert.rejects(
      qr.generateReviewQr("ChIJ123", { dark: "#ffe066" }),
      /Contraste insuffisant/,
    );
    // Une couleur foncée passe.
    assert.match(await qr.generateReviewQr("ChIJ123", { dark: "#1a1a1a" }), /^<svg/);
  });

  test("une couleur malformée est refusée avant d'atteindre le générateur", async () => {
    await assert.rejects(qr.generateReviewQr("ChIJ123", { dark: "rouge" }), /Couleur dark invalide/);
    await assert.rejects(qr.generateReviewQr("ChIJ123", { dark: "#fff" }), /Couleur dark invalide/);
  });

  test("le contraste est calculé selon WCAG", () => {
    assert.equal(Math.round(qr.contrastRatio("#000000", "#ffffff")), 21);
    assert.equal(Math.round(qr.contrastRatio("#ffffff", "#ffffff")), 1);
  });
});

describe("Conformité : aucune promesse de tri des avis", () => {
  test("aucun fichier de l'interface ne décrit de filtrage d'avis", async () => {
    // Le test précédent ne couvrait que PLANS. Une description de filtrage est
    // pourtant restée en page d'accueil pendant plusieurs jours (« un client
    // mécontent vers un formulaire privé »). Le balayage porte désormais sur
    // TOUTE l'interface : c'est là que la promesse est faite au prospect, et
    // c'est elle qui exposerait la fiche de l'artisan à une sanction Google.
    const { readdir, readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { join, extname } = await import("node:path");

    const racine = fileURLToPath(new URL("../../../", import.meta.url));
    const motifs = [
      /anti[- ]avis/i,
      /formulaire priv[ée]/i,
      /avant que l'avis ne soit public/i,
      /client m[ée]content vers/i,
      /(trie|filtre)r? les clients/i,
    ];
    const fautifs = [];

    async function parcourir(dossier) {
      for (const e of await readdir(join(racine, dossier), { withFileTypes: true })) {
        const rel = join(dossier, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === ".next" || e.name === "__tests__") continue;
          await parcourir(rel);
        } else if ([".ts", ".tsx"].includes(extname(e.name))) {
          const contenu = await readFile(join(racine, rel), "utf8");
          for (const m of motifs) if (m.test(contenu)) fautifs.push(`${rel} (${m})`);
        }
      }
    }
    for (const d of ["app", "lib", "components"]) await parcourir(d);

    assert.deepEqual(fautifs, [], `promesses de filtrage :\n${fautifs.join("\n")}`);
  });
});

describe("Autonomie de la marque", () => {
  test("aucun fichier du produit ne cite l'éditeur", async () => {
    // Décision du 29 août 2026 : MapArtisans se présente seule. Le nom de la
    // société éditrice n'a sa place que dans les mentions légales et sur les
    // factures — nulle part dans l'interface, les SMS ou les e-mails, où il
    // brouille la marque et fuiterait en marque blanche.
    const { readdir, readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { join, extname } = await import("node:path");

    // fileURLToPath, et surtout pas url.pathname : le chemin du projet contient
    // une espace, que pathname laisse encodée en %20 — le dossier serait alors
    // introuvable et le test passerait sans rien avoir lu.
    const racine = fileURLToPath(new URL("../../../", import.meta.url));
    const extensions = new Set([".ts", ".tsx", ".css", ".mjs", ".prisma"]);
    const motif = /power ?solution/i;
    const fautifs = [];

    async function parcourir(dossier) {
      for (const e of await readdir(join(racine, dossier), { withFileTypes: true })) {
        const rel = join(dossier, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === ".next") continue;
          await parcourir(rel);
        } else if (extensions.has(extname(e.name))) {
          if (motif.test(await readFile(join(racine, rel), "utf8"))) fautifs.push(rel);
        }
      }
    }
    for (const d of ["app", "lib", "prisma"]) await parcourir(d);

    assert.deepEqual(fautifs, [], `mentions résiduelles : ${fautifs.join(", ")}`);
  });
});

describe("Comptes de démonstration", () => {
  let repoMod4;
  before(async () => { repoMod4 = await import("../repo.ts"); });

  test("en production, AUCUN compte de démonstration n'existe", async () => {
    // Leur mot de passe est en clair dans le dépôt : les laisser vivre en
    // production ouvre le tableau de bord à quiconque a lu le code.
    const avant = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.DEMO_DATA;
    repoMod4.__resetRepo();
    const repo = repoMod4.memoryRepo;
    assert.equal(await repo.findUserByEmail("demo@mapartisan.ch"), null);
    process.env.NODE_ENV = avant;
    repoMod4.__resetRepo();
  });

  test("hors production, ils existent — sinon plus rien n'est testable", async () => {
    const avant = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    repoMod4.__resetRepo();
    const repo = repoMod4.memoryRepo;
    assert.ok(await repo.findUserByEmail("demo@mapartisan.ch"));
    process.env.NODE_ENV = avant;
    repoMod4.__resetRepo();
  });

  test("DEMO_DATA=1 les réactive délibérément en production", async () => {
    const avant = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.DEMO_DATA = "1";
    repoMod4.__resetRepo();
    assert.ok(await repoMod4.memoryRepo.findUserByEmail("demo@mapartisan.ch"));
    delete process.env.DEMO_DATA;
    process.env.NODE_ENV = avant;
    repoMod4.__resetRepo();
  });
});

describe("Choix du dépôt", () => {
  let repoMod5;
  before(async () => { repoMod5 = await import("../repo.ts"); });

  test("en production SANS DATABASE_URL, l'application refuse de démarrer", () => {
    // Le pire scénario possible est le repli silencieux sur la mémoire : tout
    // répond, on crée des comptes, et le premier redémarrage les efface. C'est
    // l'état dans lequel ce SaaS a réellement tourné le 30 août 2026.
    const env = process.env.NODE_ENV;
    const db = process.env.DATABASE_URL;
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    assert.throws(() => repoMod5.getRepo(), /DATABASE_URL absente en production/);
    process.env.NODE_ENV = env;
    if (db) process.env.DATABASE_URL = db;
  });

  test("hors production sans DATABASE_URL, le dépôt en mémoire est utilisé", () => {
    const env = process.env.NODE_ENV;
    const db = process.env.DATABASE_URL;
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;
    assert.equal(repoMod5.getRepo(), repoMod5.memoryRepo);
    process.env.NODE_ENV = env;
    if (db) process.env.DATABASE_URL = db;
  });
});
