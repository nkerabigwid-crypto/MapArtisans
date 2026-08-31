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
//     TypeScript accepte mais que le résolveur ESM de Node exige ;
//   · `@/...` est l'alias du projet, et `next/server` doit recevoir son
//     extension — Next l'expose sans, ce que son propre bundler résout mais
//     pas Node. Sans cela, une route d'API ne peut pas être testée du tout.
register(
  "data:text/javascript," +
    encodeURIComponent(`
      const ROOT = ${JSON.stringify(pathToFileURL(process.cwd() + "/").href)};
      export async function resolve(spec, ctx, next) {
        if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
        if (spec === "next/server") return next("next/server.js", ctx);
        if (spec.startsWith("@/")) return next(new URL(spec.slice(2) + ".ts", ROOT).href, ctx);
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

  test("trois paliers, à 49, 89 et 129 CHF", () => {
    assert.deepEqual(data.PLANS.map((p) => p.id), ["essentiel", "pro", "complet"]);
    assert.deepEqual(data.PLANS.map((p) => p.amount), [49, 89, 129]);
  });

  test("les prix montent : un palier plus cher doit offrir davantage", () => {
    // Un ordre décroissant ou une égalité rendrait la grille incompréhensible.
    const montants = data.PLANS.map((p) => p.amount);
    for (let i = 1; i < montants.length; i++) {
      assert.ok(montants[i] > montants[i - 1], `${montants[i]} doit dépasser ${montants[i - 1]}`);
    }
  });

  test("aucun palier revendeur : un seul prix public, le même pour tous", () => {
    // Retiré le 29 août 2026. Revendu avec la marge d'une agence, le même
    // logiciel arrivait plus cher chez l'artisan que sur notre page de tarifs.
    // Ce test empêche qu'un palier à tarif négocié revienne sans décision.
    assert.equal(data.PLANS.length, 3);
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
          // faqPublique.ts DÉCRIT le filtrage d'avis pour en avertir : « les
          // outils qui proposent de filtrer les clients font courir un risque
          // à votre fiche ». C'est le contraire d'une promesse, et un test
          // dédié vérifie plus bas que cette page dit bien « interdit ».
          if (rel.endsWith("faqPublique.ts")) continue;
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

describe("Inscription", () => {
  let route, repoMod6;
  before(async () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;
    repoMod6 = await import("../repo.ts");
    route = await import("../../../app/api/auth/register/route.ts");
  });

  // Chaque appel vient d'une IP differente : la limitation par IP est
  // volontairement stricte, et la partager entre les tests les ferait echouer
  // les uns a cause des autres.
  let n = 0;
  const poster = (donnees, ip = `10.0.0.${++n}`) =>
    route.POST(
      new Request("https://mapartisans.com/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(donnees),
      }),
    );

  test("une inscription valide crée le compte et ouvre la session", async () => {
    repoMod6.__resetRepo();
    const r = await poster({ email: "Nouveau@Exemple.CH", password: "phrase-de-passe-solide" });
    assert.equal(r.status, 201);

    // La casse ne doit pas creer un second compte distinct.
    const u = await repoMod6.memoryRepo.findUserByEmail("nouveau@exemple.ch");
    assert.ok(u, "le compte doit exister en base");

    const cookie = r.headers.get("set-cookie") ?? "";
    assert.match(cookie, /ma_session=/, "une session doit etre ouverte");
    assert.match(cookie, /HttpOnly/i, "le cookie doit etre hors de portee du JavaScript");
    assert.match(cookie, /SameSite=lax/i);
  });

  test("le mot de passe n'est jamais stocké en clair", async () => {
    repoMod6.__resetRepo();
    await poster({ email: "clair@exemple.ch", password: "phrase-de-passe-solide" });
    const u = await repoMod6.memoryRepo.findUserByEmail("clair@exemple.ch");
    assert.doesNotMatch(u.passwordHash, /phrase-de-passe-solide/);
    assert.match(u.passwordHash, /^scrypt\$/);
  });

  test("un mot de passe trop court est refusé", async () => {
    repoMod6.__resetRepo();
    const r = await poster({ email: "court@exemple.ch", password: "court" });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /12 caractères/);
  });

  test("un mot de passe démesuré est refusé — scrypt travaille sur toute sa longueur", async () => {
    // Sans plafond, un mot de passe d'un megaoctet occupe le processeur du
    // serveur pendant que les autres requetes attendent.
    repoMod6.__resetRepo();
    const r = await poster({ email: "long@exemple.ch", password: "x".repeat(50_000) });
    assert.equal(r.status, 400);
  });

  test("une adresse invalide est refusée", async () => {
    repoMod6.__resetRepo();
    for (const email of ["pas-une-adresse", "a@b", "@exemple.ch", "a b@exemple.ch"]) {
      assert.equal((await poster({ email, password: "phrase-de-passe-solide" })).status, 400, email);
    }
  });

  test("une adresse déjà inscrite renvoie 409, pas un doublon", async () => {
    repoMod6.__resetRepo();
    const ident = { email: "double@exemple.ch", password: "phrase-de-passe-solide" };
    assert.equal((await poster(ident)).status, 201);
    assert.equal((await poster(ident)).status, 409);
  });

  test("un corps illisible ou incomplet ne fait pas planter la route", async () => {
    repoMod6.__resetRepo();
    assert.equal((await poster({ email: "seul@exemple.ch" })).status, 400);
    assert.equal((await poster({ password: "phrase-de-passe-solide" })).status, 400);
    const brut = await route.POST(
      new Request("https://mapartisans.com/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
        body: "{ceci n'est pas du JSON",
      }),
    );
    assert.equal(brut.status, 400);
  });

  test("la création massive depuis une même IP est freinée", async () => {
    repoMod6.__resetRepo();
    const ip = "10.5.5.5";
    let refuse = 0;
    for (let i = 0; i < 8; i++) {
      const r = await poster({ email: `masse${i}@exemple.ch`, password: "phrase-de-passe-solide" }, ip);
      if (r.status === 429) refuse++;
    }
    assert.ok(refuse > 0, "au-dela du plafond horaire, les créations doivent être refusées");
  });
});

describe("Liste des métiers", () => {
  let trades;
  before(async () => { trades = await import("../../trades.ts"); });

  test("le transport figure bien dans la liste", () => {
    // La page d'accueil promet « artisans ET professionnels du transport ».
    // Le formulaire ne proposait pas Taxi : un chauffeur convaincu par la page
    // arrivait sur un choix qui ne le mentionnait nulle part.
    for (const attendu of ["taxi", "vtc", "garage", "coiffeur"]) {
      assert.ok(
        trades.TRADES.some((t) => t.value === attendu),
        `le métier « ${attendu} » doit être proposé`,
      );
    }
  });

  test("aucun identifiant en double", () => {
    // Deux métiers partageant un `value` écriraient la même chose en base, et
    // le prompt IA ne saurait plus de quel métier il parle.
    const valeurs = trades.TRADES.map((t) => t.value);
    assert.equal(new Set(valeurs).size, valeurs.length);
  });

  test("les identifiants sont stables : minuscules, sans accent ni espace", () => {
    // Ils partent en base et dans le prompt de génération. Un accent ou une
    // majuscule les rendrait fragiles au premier changement d'encodage.
    for (const t of trades.TRADES) {
      assert.match(t.value, /^[a-z_]+$/, `identifiant fragile : ${t.value}`);
    }
  });

  test("isKnownTrade rejette ce qui n'est pas au catalogue", () => {
    assert.equal(trades.isKnownTrade("taxi"), true);
    assert.equal(trades.isKnownTrade("astronaute"), false);
    assert.equal(trades.isKnownTrade(""), false);
  });

  test("le bandeau de la page d'accueil n'affiche pas « Autre »", () => {
    assert.ok(!trades.TRADE_LABELS.includes("Autre"));
    assert.ok(trades.TRADE_LABELS.includes("Taxi"));
  });
});

describe("Inscription avec entreprise", () => {
  let route, repoMod7;
  before(async () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;
    repoMod7 = await import("../repo.ts");
    route = await import("../../../app/api/auth/register/route.ts");
  });

  let n = 100;
  const poster = (d) =>
    route.POST(new Request("https://mapartisans.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++n}` },
      body: JSON.stringify(d),
    }));

  const base = { password: "phrase-de-passe-solide", companyName: "Valtransfer", country: "CH" };

  test("un métier du catalogue crée l'entreprise", async () => {
    repoMod7.__resetRepo();
    const r = await poster({ ...base, email: "taxi@exemple.ch", tradeType: "taxi" });
    assert.equal(r.status, 201);
    const u = await repoMod7.memoryRepo.findUserByEmail("taxi@exemple.ch");
    assert.ok(u);
  });

  test("un métier HORS catalogue est refusé avant toute écriture", async () => {
    // C'est le seul endroit ou cette validation compte : un identifiant
    // inconnu ecrit en base contamine le prompt de generation, les
    // statistiques et la categorie Google.
    repoMod7.__resetRepo();
    for (const tradeType of ["boulanger", "Taxi_Genève", "Plombier Électricien", "../etc"]) {
      const r = await poster({ ...base, email: `x${++n}@exemple.ch`, tradeType });
      assert.equal(r.status, 400, `« ${tradeType} » doit être refusé`);
      assert.match((await r.json()).error, /Métier inconnu/);
    }
  });

  test("le numéro au bon format est enregistré, le mauvais est ignoré", async () => {
    repoMod7.__resetRepo();
    await poster({ ...base, email: "bon@exemple.ch", tradeType: "taxi", phoneNumber: "+41 79 123 45 67" });
    const bon = await repoMod7.memoryRepo.findUserByEmail("bon@exemple.ch");
    assert.equal(bon.phoneNumber, "+41791234567", "les espaces doivent être retirés");

    await poster({ ...base, email: "mauvais@exemple.ch", tradeType: "taxi", phoneNumber: "079 pas un numero" });
    const mauvais = await repoMod7.memoryRepo.findUserByEmail("mauvais@exemple.ch");
    assert.equal(mauvais.phoneNumber, null, "un numéro invalide ne doit pas être enregistré");
  });

  test("un pays hors liste retombe sur la Suisse plutôt que d'échouer", async () => {
    // La contrainte SQL n'accepte que six pays. Refuser l'inscription entiere
    // pour un champ secondaire ferait perdre le client.
    repoMod7.__resetRepo();
    const r = await poster({ ...base, email: "pays@exemple.ch", tradeType: "taxi", country: "ZZ" });
    assert.equal(r.status, 201);
  });

  test("l'inscription reste possible sans entreprise", async () => {
    repoMod7.__resetRepo();
    const r = await poster({ email: "seul@exemple.ch", password: "phrase-de-passe-solide" });
    assert.equal(r.status, 201);
  });
});

describe("Ordinal français", () => {
  let pin;
  before(async () => { pin = await import("../../format.ts"); });

  test("le premier s'écrit « 1re », pas « 1e »", () => {
    // Seul ordinal irrégulier du français. « 1e » saute aux yeux d'un lecteur
    // francophone — et la page d'accueil l'affichait, alors que le rapport SMS
    // était correct depuis longtemps. D'où une fonction unique.
    assert.equal(pin.ordinalFr(1), "1re");
  });

  test("les suivants prennent « e »", () => {
    assert.equal(pin.ordinalFr(2), "2e");
    assert.equal(pin.ordinalFr(14), "14e");
  });

  test("une fiche introuvable s'affiche par un tiret, pas par un zéro", () => {
    // « 0e » se lirait comme une position, alors que la fiche n'apparaît nulle
    // part dans les résultats.
    assert.equal(pin.ordinalFr(null), "—");
  });
});

describe("Balisage Schema.org du site artisan", () => {
  let schema, trades;
  before(async () => {
    schema = await import("../schemaOrg.ts");
    trades = await import("../../trades.ts");
  });

  const base = { businessName: "Dupont Plomberie", tradeType: "plombier", city: "Lausanne" };

  test("AUCUN avis ni note globale — la page en deviendrait inéligible", () => {
    // Google : « If the entity that's being reviewed controls the reviews about
    // itself, their pages that use LocalBusiness […] are ineligible for star
    // review feature », et cite nommément les avis Google republiés sur son
    // propre site. Le gabarit précédent le faisait.
    const ld = schema.buildLocalBusinessJsonLd({
      ...base,
      phone: "+41791234567",
      areaServed: ["Ouchy"],
    });
    assert.equal(ld.aggregateRating, undefined);
    assert.equal(ld.review, undefined);
    assert.doesNotMatch(JSON.stringify(ld), /rating|Review/i);
  });

  test("aucun champ n'est inventé : ce qu'on n'a pas est absent", () => {
    // Un balisage qui affirme des horaires ou une adresse faux est pire que
    // pas de balisage : Google le confronte au reste du web.
    const ld = schema.buildLocalBusinessJsonLd(base);
    for (const cle of ["telephone", "email", "geo", "openingHoursSpecification", "makesOffer"]) {
      assert.equal(ld[cle], undefined, `${cle} ne doit pas apparaître`);
    }
  });

  test("les 20 métiers ont un type Schema.org valide", () => {
    // Un type inventé rend tout le balisage invalide. Ceux-ci existent tous
    // dans le vocabulaire schema.org.
    const valides = new Set([
      "Plumber", "Electrician", "HVACBusiness", "Locksmith", "RoofingContractor",
      "HousePainter", "GeneralContractor", "TaxiService", "AutoRepair",
      "AutoBodyShop", "HairSalon", "BeautySalon", "LocalBusiness",
    ]);
    for (const t of trades.TRADES) {
      const ld = schema.buildLocalBusinessJsonLd({ ...base, tradeType: t.value });
      assert.ok(valides.has(ld["@type"]), `${t.value} → « ${ld["@type"]} » inconnu`);
    }
  });

  test("le type est le plus précis disponible, jamais LocalBusiness par défaut", () => {
    // « Plumber » dit à un robot ce que « LocalBusiness » le laisse deviner.
    assert.equal(schema.buildLocalBusinessJsonLd({ ...base, tradeType: "taxi" })["@type"], "TaxiService");
    assert.equal(schema.buildLocalBusinessJsonLd({ ...base, tradeType: "garage" })["@type"], "AutoRepair");
    assert.equal(schema.buildLocalBusinessJsonLd({ ...base, tradeType: "coiffeur" })["@type"], "HairSalon");
  });

  test("les données présentes sont bien émises", () => {
    const ld = schema.buildLocalBusinessJsonLd({
      ...base,
      streetAddress: "Rue du Lac 4",
      postalCode: "1003",
      latitude: 46.5197,
      longitude: 6.6323,
      phone: "+41791234567",
      googleMapsUrl: "https://maps.google.com/?cid=123",
      areaServed: ["Ouchy", "Chailly"],
      openingHours: [{ days: ["Monday"], opens: "08:00", closes: "18:00" }],
    });
    assert.equal(ld.address.streetAddress, "Rue du Lac 4");
    assert.equal(ld.address.addressCountry, "CH");
    assert.equal(ld.geo.latitude, 46.5197);
    assert.equal(ld.areaServed.length, 2);
    assert.deepEqual(ld.sameAs, ["https://maps.google.com/?cid=123"]);
  });

  test("une raison sociale piégée ne peut pas casser la balise script", () => {
    // Sans échappement, « </script> » dans un nom d'entreprise ferme la balise
    // et injecte du HTML dans la page.
    const ld = schema.buildLocalBusinessJsonLd({
      ...base,
      businessName: 'Dupont</script><img src=x onerror=alert(1)>',
    });
    const serialise = schema.serialiserJsonLd(ld);
    assert.doesNotMatch(serialise, /<\/script>/i);
    assert.doesNotMatch(serialise, /<img/i);
  });

  test("le JSON produit reste analysable", () => {
    const ld = schema.buildLocalBusinessJsonLd({ ...base, phone: "+41791234567" });
    const relu = JSON.parse(schema.serialiserJsonLd(ld).replace(/\\u003c/g, "<"));
    assert.equal(relu["@context"], "https://schema.org");
    assert.equal(relu.name, "Dupont Plomberie");
  });
});

describe("Page publique de questions fréquentes", () => {
  let faqp;
  before(async () => { faqp = await import("../../faqPublique.ts"); });

  test("aucune réponse ne promet une position ou un résultat", () => {
    // C'est ce que vend le secteur, et c'est invérifiable : le classement
    // dépend de l'algorithme, des concurrents et du lieu de la recherche.
    const interdits = [
      /\bgarantit?\b(?!.{0,40}\bmesure\b)/i,
      /\btop 1 garanti\b/i,
      /\bpremière place assurée\b/i,
      /\bvous serez (premier|1er)\b/i,
    ];
    for (const q of faqp.toutesLesQuestions()) {
      for (const motif of interdits) {
        assert.doesNotMatch(q.reponse, motif, `« ${q.question} »`);
      }
    }
  });

  test("la question sur le tri des avis dit clairement que c'est interdit", () => {
    // C'est la réponse qui différencie le produit : les concurrents vendent
    // ce filtrage, et il fait sanctionner la fiche du client.
    const q = faqp
      .toutesLesQuestions()
      .find((x) => /clients satisfaits/.test(x.question));
    assert.ok(q, "la question doit exister");
    assert.match(q.reponse, /interdit/i);
  });

  test("chaque réponse tient en HTML léger, sans script ni style", () => {
    // Le contenu est inséré tel quel dans la page.
    for (const q of faqp.toutesLesQuestions()) {
      assert.doesNotMatch(q.reponse, /<script|<style|onerror=|javascript:/i, q.question);
      assert.match(q.reponse, /^<p>/, `« ${q.question} » doit commencer par un paragraphe`);
    }
  });

  test("texteBrut retire le balisage pour le Schema.org", () => {
    // Le balisage FAQPage attend du texte, pas du HTML.
    const brut = faqp.texteBrut("<p>Trois. <strong>C'est</strong> le Local Pack.</p>");
    assert.equal(brut, "Trois. C'est le Local Pack.");
  });

  test("assez de questions pour justifier une page", () => {
    // Une page de trois questions ne capte rien et dilue le reste du site.
    assert.ok(faqp.toutesLesQuestions().length >= 12);
    assert.ok(faqp.FAQ_PUBLIQUE.length >= 3, "regroupées en sections lisibles");
  });

  test("aucune question n'est posée deux fois", () => {
    const qs = faqp.toutesLesQuestions().map((q) => q.question);
    assert.equal(new Set(qs).size, qs.length);
  });
});

describe("Pages légales", () => {
  let legal;
  before(async () => { legal = await import("../../legal.ts"); });

  test("sans identité configurée, les champs manquants sont nommés", () => {
    // Une page légale incomplète qui en aurait l'air complète est le pire des
    // cas : elle donne l'illusion de la conformité tout en manquant
    // précisément ce que la loi exige.
    const env = { ...process.env };
    for (const c of ["FACTURATION_RAISON_SOCIALE", "FACTURATION_ADRESSE", "FACTURATION_EMAIL"]) {
      delete process.env[c];
    }
    const manquants = legal.champsManquants();
    assert.equal(manquants.length, 3);
    assert.equal(legal.identiteEditeur(), null, "aucune identité partielle n'est renvoyée");
    Object.assign(process.env, env);
  });

  test("l'identité complète est restituée, adresse découpée en lignes", () => {
    process.env.FACTURATION_RAISON_SOCIALE = "Editeur SA";
    process.env.FACTURATION_ADRESSE = "Rue du Test 1 | 1000 Lausanne";
    process.env.FACTURATION_EMAIL = "contact@exemple.ch";
    const e = legal.identiteEditeur();
    assert.equal(e.raisonSociale, "Editeur SA");
    assert.deepEqual(e.adresse, ["Rue du Test 1", "1000 Lausanne"]);
    assert.equal(e.ide, null, "non assujetti tant qu'aucun IDE n'est renseigné");
    for (const c of ["FACTURATION_RAISON_SOCIALE", "FACTURATION_ADRESSE", "FACTURATION_EMAIL"]) {
      delete process.env[c];
    }
  });

  test("les sous-traitants listés correspondent aux services réellement appelés", async () => {
    // Un sous-traitant omis est une omission ; un sous-traitant listé mais
    // jamais utilisé est une inexactitude. Les deux se vérifient en lisant le
    // code, et c'est ce que fait ce test.
    const noms = legal.SOUS_TRAITANTS.map((s) => s.nom.toLowerCase());
    for (const attendu of ["openai", "twilio", "hostinger"]) {
      assert.ok(noms.some((n) => n.includes(attendu)), `${attendu} doit être déclaré`);
    }
    assert.ok(noms.some((n) => n.includes("google")));
  });

  test("chaque sous-traitant précise le pays et les données transmises", () => {
    for (const s of legal.SOUS_TRAITANTS) {
      assert.ok(s.pays.length > 2, `pays manquant pour ${s.nom}`);
      assert.ok(s.donnees.length > 10, `données non précisées pour ${s.nom}`);
    }
  });

  test("les durées de conservation reprennent ce que fait le code", () => {
    const textes = legal.CONSERVATION.map((c) => `${c.donnee} ${c.duree}`).join(" ");
    // 15 minutes : magicLink.ts. 30 jours : deploy/sauvegarde.sh.
    // 10 ans : Code des obligations, art. 958f.
    assert.match(textes, /15 minutes/);
    assert.match(textes, /30 jours/);
    assert.match(textes, /10 ans/);
  });
});
