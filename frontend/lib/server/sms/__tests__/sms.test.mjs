/**
 * Rapport SMS hebdomadaire : encodage, coût, composition, pipeline complet.
 *
 * Le pipeline est exercé contre un VRAI Redis (binaire éphémère) et une VRAIE
 * exécution BullMQ. Seul l'envoi Twilio est injecté — la clé fournie n'ayant
 * aucune permission (erreur 70051), aucun envoi réel n'est possible ici.
 *
 * Exécution : node --test lib/server/sms/__tests__/sms.test.mjs
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { RedisMemoryServer } from "redis-memory-server";

const projectRoot = pathToFileURL(process.cwd() + "/").href;
register(
  "data:text/javascript," +
    encodeURIComponent(`
      const ROOT = ${JSON.stringify(projectRoot)};
      export async function resolve(spec, ctx, next) {
        if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
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

let redisServer, gsm, report, twilio, repoMod, queueMod, workerMod, connMod, branding;

before(async () => {
  redisServer = new RedisMemoryServer();
  const host = await redisServer.getHost();
  const port = await redisServer.getPort();
  process.env.REDIS_URL = `redis://${host}:${port}`;

  gsm = await import("../gsm7.ts");
  report = await import("../weeklyReport.ts");
  twilio = await import("../twilio.ts");
  repoMod = await import("../../repo.ts");
  queueMod = await import("../../queue/reportQueue.ts");
  workerMod = await import("../../queue/reportWorker.ts");
  connMod = await import("../../queue/connection.ts");
  branding = await import("../../branding.ts");
});

after(async () => {
  await queueMod.getWeeklyReportQueue().close();
  connMod.__resetConnection();
  await redisServer.stop();
});

async function clearQueue() {
  await queueMod.getWeeklyReportQueue().obliterate({ force: true });
}

function waitForJob(worker, jobId, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("délai dépassé")), timeoutMs);
    worker.on("completed", (job) => {
      if (job.id === jobId) { clearTimeout(timer); resolve("completed"); }
    });
    worker.on("failed", (job) => {
      if (job?.id === jobId) { clearTimeout(timer); resolve("failed"); }
    });
  });
}

// ---------------------------------------------------------------------------
describe("Encodage GSM-7 et coût des segments", () => {
  test("les accents français courants restent en GSM-7", () => {
    for (const c of ["é", "è", "à", "ù", "ì", "ò", "ä", "ö", "ü", "ñ"]) {
      assert.equal(gsm.isGsm7(c), true, `« ${c} » devrait être en GSM-7`);
    }
  });

  test("les circonflexes et le ç minuscule forcent l'UCS-2", () => {
    // C'est le piège coûteux : ces caractères sont fréquents en français
    // (« être », « coût », « français ») et triplent la facture.
    for (const c of ["ê", "û", "î", "ô", "â", "ç"]) {
      assert.equal(gsm.isGsm7(c), false, `« ${c} » n'est PAS en GSM-7`);
    }
  });

  test("un seul caractère hors table fait basculer tout le message", () => {
    const propre = gsm.measureSms("Vous voila 3e sur Google Maps");
    const piege = gsm.measureSms("Vous êtes 3e sur Google Maps");
    assert.equal(propre.encoding, "GSM-7");
    assert.equal(piege.encoding, "UCS-2");
    assert.deepEqual(piege.offenders, ["ê"]);
  });

  test("les seuils de segmentation suivent la norme", () => {
    assert.equal(gsm.measureSms("a".repeat(160)).segments, 1);
    assert.equal(gsm.measureSms("a".repeat(161)).segments, 2, "au-delà de 160 : 153 par segment");
    assert.equal(gsm.measureSms("é".repeat(70)).segments, 1, "é est en GSM-7");
    assert.equal(gsm.measureSms("ê".repeat(70)).segments, 1, "UCS-2 : 70 pour un segment");
    assert.equal(gsm.measureSms("ê".repeat(71)).segments, 2, "au-delà de 70 : 67 par segment");
  });

  test("les caractères d'extension coûtent deux unités", () => {
    assert.equal(gsm.measureSms("€").units, 2);
    assert.equal(gsm.measureSms("[").units, 2);
    assert.equal(gsm.measureSms("a").units, 1);
  });
});

// ---------------------------------------------------------------------------
describe("Composition du rapport hebdomadaire", () => {
  const base = {
    businessName: "Dupont Plomberie",
    bestPosition: 2,
    previousPosition: 4,
    callsGenerated: 14,
    directionsGenerated: 4,
    pendingReviews: 0,
  };

  test("le rapport nominal tient en un segment GSM-7", () => {
    const body = report.composeWeeklyReport(base);
    const cost = gsm.measureSms(body);
    assert.equal(cost.encoding, "GSM-7", `caractères fautifs : ${cost.offenders.join(" ")}`);
    assert.equal(cost.segments, 1);
  });

  test("une progression s'affiche comme un gain de places", () => {
    // Passer de la 4e à la 2e est un gain de 2 : le signe doit être positif,
    // à l'inverse de la soustraction des rangs.
    assert.match(report.composeWeeklyReport(base), /\(\+2\)/);
  });

  test("une régression s'affiche avec un signe négatif", () => {
    const body = report.composeWeeklyReport({ ...base, bestPosition: 6, previousPosition: 3 });
    assert.match(body, /\(-3\)/);
  });

  test("la première position s'écrit « 1re »", () => {
    const body = report.composeWeeklyReport({ ...base, bestPosition: 1, previousPosition: null });
    assert.match(body, /position 1re/);
    assert.ok(!body.includes("1e"), "« 1e » serait une faute de français");
  });

  test("une fiche introuvable est dite explicitement", () => {
    const body = report.composeWeeklyReport({ ...base, bestPosition: null });
    assert.match(body, /introuvable/);
  });

  test("les avis en attente n'apparaissent que s'il y en a", () => {
    assert.ok(!report.composeWeeklyReport(base).includes("valider"));
    assert.match(report.composeWeeklyReport({ ...base, pendingReviews: 3 }), /3 avis a valider/);
  });

  test("le rapport tient en un segment même dans le pire des cas", () => {
    const pire = report.composeWeeklyReport({
      businessName: "Entreprise au nom tres long",
      bestPosition: 99,
      previousPosition: 1,
      callsGenerated: 9999,
      directionsGenerated: 9999,
      pendingReviews: 999,
    });
    assert.equal(report.reportFitsOneSegment(pire), true, `trop long : « ${pire} »`);
  });
});

// ---------------------------------------------------------------------------
describe("Garde-fou de coût", () => {
  test("un message d'un segment passe", () => {
    assert.doesNotThrow(() => twilio.assertAffordable("Message court", 1));
  });

  test("un message trop long est refusé avant l'envoi", () => {
    assert.throws(() => twilio.assertAffordable("a".repeat(200), 1), /trop long/);
  });

  test("le refus nomme les caractères fautifs", () => {
    assert.throws(
      () => twilio.assertAffordable("ê".repeat(100), 1),
      /hors GSM-7.*ê/s,
    );
  });
});

// ---------------------------------------------------------------------------
describe("Marque blanche — resolution et securite", () => {
  test("un Host est normalise avant toute comparaison", () => {
    assert.equal(branding.normalizeHost("SEO.MonAgence.CH:443"), "seo.monagence.ch");
    assert.equal(branding.normalizeHost("seo.monagence.ch."), "seo.monagence.ch");
    assert.equal(branding.normalizeHost("  Seo.Monagence.ch  "), "seo.monagence.ch");
  });

  test("un Host falsifie ou absent ne provoque pas d'erreur", () => {
    for (const mauvais of [null, undefined, "", ":", "a b", "<script>", "évil.ch"]) {
      assert.equal(branding.normalizeHost(mauvais), null, `« ${mauvais} » doit etre rejete`);
    }
  });

  test("une couleur injectee en CSS est refusee", () => {
    // Sans validation, ces valeurs s'echapperaient de la variable CSS.
    const attaques = [
      "red; } body { display:none } .x {",
      "#123F6D; background:url(https://exfil.example)",
      "expression(alert(1))",
      "javascript:alert(1)",
      "#12",
      "",
    ];
    for (const a of attaques) {
      assert.equal(branding.validateHexColor(a), "#123f6d", `« ${a} » doit retomber par defaut`);
    }
  });

  test("une couleur hexadecimale valide est conservee", () => {
    assert.equal(branding.validateHexColor("#8B1E3F"), "#8b1e3f");
    assert.equal(branding.validateHexColor("#abcdef"), "#abcdef");
  });

  test("un logo non-HTTPS est refuse", () => {
    assert.equal(branding.validateLogoUrl("http://agence.ch/l.png"), null);
    assert.equal(branding.validateLogoUrl("javascript:alert(1)"), null);
    assert.equal(branding.validateLogoUrl("data:image/svg+xml,<svg onload=alert(1)>"), null);
    assert.ok(branding.validateLogoUrl("https://agence.ch/l.png"));
  });

  test("les variables CSS produites ne contiennent jamais de valeur libre", () => {
    const css = branding.brandingCssVars({
      ...branding.DEFAULT_BRANDING,
      primaryColor: "red; } * { display:none } .x {",
    });
    assert.equal(css, "--accent: #123f6d;");
    assert.ok(!css.includes("display:none"));
  });

  test("un domaine inconnu retombe sur la marque par defaut", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    const inconnu = await repo.findAgencyByDomain("mapartisans.com");
    assert.equal(inconnu, null);
    assert.equal(branding.toBranding(inconnu).brandName, "MapArtisans");
    assert.equal(branding.toBranding(inconnu).isWhiteLabel, false);
  });

  test("un domaine d'agence charge sa marque", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    const a = await repo.findAgencyByDomain("seo.monagence.ch");
    assert.ok(a, "l'agence de demonstration doit exister");
    const b = branding.toBranding(a);
    assert.equal(b.brandName, "MonAgence SEO");
    assert.equal(b.primaryColor, "#8b1e3f");
    assert.equal(b.isWhiteLabel, true);
  });
});

// ---------------------------------------------------------------------------
describe("Marque blanche — rapport SMS", () => {
  const base = {
    businessName: "Bornand Electricite",
    bestPosition: 5, previousPosition: 9,
    callsGenerated: 6, directionsGenerated: 2, pendingReviews: 0,
  };

  test("un client direct recoit « MapArtisans »", () => {
    assert.match(report.composeWeeklyReport(base), /^MapArtisans/);
  });

  test("un client d'agence ne voit JAMAIS notre nom", () => {
    const body = report.composeWeeklyReport({ ...base, brandName: "MonAgence SEO" });
    assert.match(body, /^MonAgence SEO/);
    assert.ok(!body.includes("MapArtisans"), "notre marque doit disparaitre completement");
  });

  test("un nom d'agence tres long ne fait pas basculer a deux segments", () => {
    const body = report.composeWeeklyReport({
      ...base,
      brandName: "Agence de Referencement Local et Digital de Suisse Romande SARL",
      bestPosition: null, pendingReviews: 999,
      callsGenerated: 9999, directionsGenerated: 9999,
    });
    assert.equal(report.reportFitsOneSegment(body), true, `deux segments : « ${body} »`);
  });

  test("la troncature coupe sur un espace, pas au milieu d'un mot", () => {
    const body = report.composeWeeklyReport({
      ...base,
      brandName: "Agence de Referencement Local et Digital Romande",
    });
    const marque = body.split(" - ")[0];
    assert.ok(!marque.endsWith(" "), "pas d'espace final");
    assert.ok(marque.length <= 40);
  });
});

// ---------------------------------------------------------------------------
describe("Choix des identifiants Twilio", () => {
  const sauvegarde = {};
  const CLES = [
    "TWILIO_ACCOUNT_SID", "TWILIO_FROM_NUMBER",
    "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_AUTH_TOKEN",
  ];
  const poser = (vals) => {
    for (const k of CLES) { sauvegarde[k] = process.env[k]; delete process.env[k]; }
    Object.assign(process.env, vals);
  };
  const restaurer = () => {
    for (const k of CLES) {
      if (sauvegarde[k] === undefined) delete process.env[k];
      else process.env[k] = sauvegarde[k];
    }
  };

  test("sans Account SID ni numéro : refus explicite", async () => {
    poser({});
    const s = twilio.resolveSmsSender();
    await assert.rejects(() => s.send("+41790000000", "test"), /TWILIO_NOT_CONFIGURED/);
    restaurer();
  });

  test("Account SID + numéro mais aucun identifiant : refus", async () => {
    poser({ TWILIO_ACCOUNT_SID: "AC000", TWILIO_FROM_NUMBER: "+41766014450" });
    const s = twilio.resolveSmsSender();
    await assert.rejects(() => s.send("+41790000000", "test"), /TWILIO_NOT_CONFIGURED/);
    restaurer();
  });

  test("la clé API est retenue quand elle est présente", () => {
    poser({
      TWILIO_ACCOUNT_SID: "AC000", TWILIO_FROM_NUMBER: "+41766014450",
      TWILIO_API_KEY_SID: "SK111", TWILIO_API_KEY_SECRET: "secret",
      TWILIO_AUTH_TOKEN: "token",
    });
    // Un expéditeur réel est construit, pas notConfiguredSender.
    assert.notEqual(twilio.resolveSmsSender(), twilio.notConfiguredSender);
    restaurer();
  });

  test("l'Auth Token sert de repli si la clé API est absente", () => {
    poser({
      TWILIO_ACCOUNT_SID: "AC000", TWILIO_FROM_NUMBER: "+41766014450",
      TWILIO_AUTH_TOKEN: "token",
    });
    assert.notEqual(twilio.resolveSmsSender(), twilio.notConfiguredSender);
    restaurer();
  });
});

// ---------------------------------------------------------------------------
describe("Pipeline SMS (BullMQ + Redis réel)", () => {
  test("le rapport part vers le bon numéro, avec le bon contenu", async () => {
    await clearQueue();
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();

    const n = await queueMod.enqueueWeeklyReports(repo);
    // Deux fiches ont un numéro : g-001 (client direct) et g-003 (client d'une
    // agence en marque blanche). g-002 est écartée, son propriétaire n'ayant
    // pas de mobile enregistré.
    assert.equal(n, 2, "g-001 et g-003 ont un numéro, pas g-002");

    const envoyes = [];
    const worker = workerMod.createReportWorker({
      repo,
      sender: { async send(to, body) { envoyes.push({ to, body }); } },
    });

    const semaine = queueMod.isoWeekKey(new Date());
    const outcome = await waitForJob(worker, `g-001__${semaine}`);
    await worker.close();

    assert.equal(outcome, "completed");

    const direct = envoyes.find((e) => e.to === "+41791234567");
    assert.ok(direct, "le client direct doit être servi");
    assert.match(direct.body, /position 2e \(\+2\)/);
    assert.match(direct.body, /14 appels/);
    assert.match(direct.body, /^MapArtisans/, "client direct : notre marque");

    const viaAgence = envoyes.find((e) => e.to === "+41780000000");
    assert.ok(viaAgence, "le client de l'agence doit être servi aussi");
    assert.match(viaAgence.body, /^MonAgence SEO/, "marque blanche appliquée");
    assert.ok(!viaAgence.body.includes("MapArtisans"),
      "un artisan passé par une agence ne doit jamais voir notre nom");
  });

  test("une fiche sans numéro n'est jamais mise en file", async () => {
    await clearQueue();
    repoMod.__resetRepo();
    const stats = await repoMod.getRepo().listWeeklyStats();
    assert.ok(!stats.some((s) => s.googleProfileId === "g-002"),
      "u-002 n'a pas de mobile : sa fiche doit être écartée");
  });

  test("sans Twilio configuré, l'échec est explicite et non silencieux", async () => {
    await clearQueue();
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    await queueMod.enqueueWeeklyReports(repo);

    // Aucun sender injecté : resolveSmsSender() retombe sur notConfiguredSender,
    // les variables Twilio étant absentes de l'environnement de test.
    const worker = workerMod.createReportWorker({ repo });
    const semaine = queueMod.isoWeekKey(new Date());
    const outcome = await waitForJob(worker, `g-001__${semaine}`);
    await worker.close();

    assert.equal(outcome, "failed", "un faux succès masquerait l'absence de configuration");
  });

  test("le même artisan ne reçoit pas deux rapports la même semaine", async () => {
    await clearQueue();
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();

    await queueMod.enqueueWeeklyReports(repo);
    await queueMod.enqueueWeeklyReports(repo); // reprise après incident

    const q = queueMod.getWeeklyReportQueue();
    const enAttente = await q.getWaitingCount();
    assert.equal(enAttente, 2, "deux fiches éligibles, aucun doublon malgré le second appel");
  });
});

// ---------------------------------------------------------------------------
describe("Clé de semaine ISO 8601", () => {
  test("deux jours de la même semaine donnent la même clé", () => {
    const lundi = new Date("2026-08-24T10:00:00Z");
    const vendredi = new Date("2026-08-28T18:00:00Z");
    assert.equal(queueMod.isoWeekKey(lundi), queueMod.isoWeekKey(vendredi));
  });

  test("deux semaines différentes donnent des clés différentes", () => {
    const s1 = queueMod.isoWeekKey(new Date("2026-08-24T10:00:00Z"));
    const s2 = queueMod.isoWeekKey(new Date("2026-08-31T10:00:00Z"));
    assert.notEqual(s1, s2);
  });

  test("le passage d'année suit la norme ISO, pas l'année civile", () => {
    // Le 31 décembre 2025 est un mercredi : il appartient à la semaine 1 de
    // 2026 au sens ISO, la semaine contenant le premier jeudi de l'année.
    // Un calcul naïf le rangerait en semaine 53 de 2025 et produirait un
    // doublon la semaine suivante.
    const cle = queueMod.isoWeekKey(new Date("2025-12-31T12:00:00Z"));
    assert.equal(cle, "2026-W01");
  });
});

describe("Messages de bienvenue", () => {
  let welcomeSms, welcomeMail, magic;
  before(async () => {
    welcomeSms = await import("../welcome.ts");
    welcomeMail = await import("../../email/welcome.ts");
    magic = await import("../../magicLink.ts");
  });

  test("le SMS de bienvenue ne contient JAMAIS le lien de connexion", async () => {
    // Le numéro vient d'un formulaire de paiement et n'est vérifié par personne.
    // Un chiffre de travers enverrait un accès complet au compte à un inconnu.
    const { token } = await magic.createMagicLink("u-001");
    const corps = welcomeSms.composeWelcomeSms();
    assert.doesNotMatch(corps, /https?:\/\//, "aucune URL");
    assert.ok(!corps.includes(token), "aucun jeton");
    assert.match(corps, /e-mail/, "il doit renvoyer vers l'e-mail");
  });

  test("le SMS tient en un segment GSM-7, marque d'agence comprise", () => {
    for (const brandName of [null, "MonAgence SEO", "A".repeat(60)]) {
      const corps = welcomeSms.composeWelcomeSms({ brandName });
      assert.ok(
        welcomeSms.welcomeFitsOneSegment(corps),
        `dépassement pour « ${brandName} » : ${corps.length} caractères`,
      );
    }
  });

  test("l'e-mail porte le lien, annonce sa durée et son usage unique", () => {
    const lien = "https://mapartisans.com/connexion/lien/abc123";
    const mail = welcomeMail.composeWelcomeEmail({ magicLink: lien });
    assert.ok(mail.text.includes(lien), "le lien doit être copiable en texte brut");
    assert.ok(mail.html.includes(lien));
    assert.match(mail.text, /15 minutes/);
    assert.match(mail.text, /une seule fois/);
  });

  test("l'e-mail invite à répondre — l'adresse d'envoi ne doit donc pas être un no-reply", () => {
    const mail = welcomeMail.composeWelcomeEmail({
      magicLink: "https://mapartisans.com/connexion/lien/abc",
    });
    assert.match(mail.text, /Répondez simplement à ce message/);
    assert.match(mail.html, /Répondez simplement à ce message/);
  });

  test("l'e-mail ne charge aucune ressource externe", () => {
    // Un pixel de suivi ou un logo distant transmettrait l'URL de la page —
    // donc potentiellement le jeton — au serveur qui sert l'image.
    const mail = welcomeMail.composeWelcomeEmail({
      magicLink: "https://mapartisans.com/connexion/lien/abc",
    });
    assert.doesNotMatch(mail.html, /<img/i);
    assert.doesNotMatch(mail.html, /src=/i);
  });

  test("une marque d'agence est échappée avant insertion dans le HTML", () => {
    // Le nom vient de la base : il est saisi par l'agence, pas par nous.
    const mail = welcomeMail.composeWelcomeEmail({
      magicLink: "https://mapartisans.com/connexion/lien/abc",
      brandName: '<script>alert(1)</script>',
    });
    assert.doesNotMatch(mail.html, /<script>/);
    assert.match(mail.html, /&lt;script&gt;/);
  });

  test("marque blanche : le nom MapArtisans n'apparaît nulle part", () => {
    const marque = "MonAgence SEO";
    const sms = welcomeSms.composeWelcomeSms({ brandName: marque });
    const mail = welcomeMail.composeWelcomeEmail({
      magicLink: "https://seo.monagence.ch/connexion/lien/abc",
      brandName: marque,
    });
    for (const t of [sms, mail.subject, mail.text, mail.html]) {
      assert.doesNotMatch(t, /MapArtisans/, `fuite de marque dans : ${t.slice(0, 60)}`);
    }
  });
});
