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

describe("Envoi d'e-mails", () => {
  let sender, bienvenue, repoMod;
  before(async () => {
    sender = await import("../../email/sender.ts");
    bienvenue = await import("../../email/bienvenue.ts");
    repoMod = await import("../../repo.ts");
  });

  test("sans fournisseur configuré, l'échec est BRUYANT", async () => {
    // Un e-mail avalé en silence laisse un client qui a payé sans aucun moyen
    // de se connecter. Il ne réessaie pas : il demande un remboursement.
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    await assert.rejects(
      sender.resolveEmailSender().send({ to: "a@b.ch", subject: "x", text: "x", html: "x" }),
      /aucun fournisseur configuré/,
    );
  });

  test("une adresse en no-reply est REFUSÉE", () => {
    // Nos e-mails disent « Répondez simplement à ce message ». Expédier depuis
    // une adresse qui rejette les réponses ferait mentir le message dès le
    // premier client qui essaie.
    for (const from of ["no-reply@mapartisans.com", "noreply@x.ch", "ne-pas-repondre@x.ch"]) {
      const r = sender.validerExpediteur(from);
      assert.equal(r.ok, false, from);
      assert.match(r.raison, /no-reply/i);
    }
  });

  test("une adresse d'expédition normale est acceptée, avec ou sans nom", () => {
    assert.equal(sender.validerExpediteur("contact@mapartisans.com").ok, true);
    assert.equal(sender.validerExpediteur("MapArtisans <contact@mapartisans.com>").ok, true);
  });

  test("une adresse malformée est refusée", () => {
    for (const from of ["pas-une-adresse", "a@b", ""]) {
      assert.equal(sender.validerExpediteur(from).ok, false, from);
    }
  });

  test("un envoi en échec ne fait PAS échouer l'inscription", async () => {
    // Le compte est déjà créé et la session ouverte. Perdre le client parce
    // qu'un fournisseur d'e-mails est indisponible serait absurde.
    repoMod.__resetRepo();
    const repo = repoMod.memoryRepo;
    const u = await repo.createUser("echec@exemple.ch", "phrase-de-passe-solide");
    const r = await bienvenue.envoyerBienvenue(
      { userId: u.id, email: u.email },
      {
        repo,
        sender: { async send() { throw new Error("fournisseur indisponible"); } },
      },
    );
    assert.equal(r.envoye, false);
    assert.match(r.raison, /indisponible/);
  });

  test("un envoi réussi porte le lien magique en HTTPS", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.memoryRepo;
    const u = await repo.createUser("ok@exemple.ch", "phrase-de-passe-solide");
    let envoye = null;
    const r = await bienvenue.envoyerBienvenue(
      { userId: u.id, email: u.email },
      { repo, sender: { async send(m) { envoye = m; } } },
    );
    assert.equal(r.envoye, true);
    assert.equal(envoye.to, "ok@exemple.ch");
    assert.match(envoye.text, /https:\/\/[^\s]+\/connexion\/lien\//);
    // Le jeton est dans le CHEMIN, jamais en paramètre de requête : un
    // paramètre part dans l'en-tête Referer vers chaque ressource tierce.
    assert.doesNotMatch(envoye.text, /\/connexion\/lien\?/);
  });

  test("le jeton envoyé est réellement consommable", async () => {
    // Un lien qui part mais n'ouvre aucune session ne vaut rien.
    repoMod.__resetRepo();
    const repo = repoMod.memoryRepo;
    const magic = await import("../../magicLink.ts");
    const u = await repo.createUser("consomme@exemple.ch", "phrase-de-passe-solide");
    let envoye = null;
    await bienvenue.envoyerBienvenue(
      { userId: u.id, email: u.email },
      { repo, sender: { async send(m) { envoye = m; } } },
    );
    const jeton = envoye.text.match(/\/connexion\/lien\/([A-Za-z0-9_-]+)/)[1];
    const verdict = magic.evaluerLien(await repo.consumeMagicLink(await magic.hashMagicToken(jeton)));
    assert.equal(verdict.ok, true);
    assert.equal(verdict.userId, u.id);
  });

  test("la facture part en pièce jointe quand elle existe", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.memoryRepo;
    const u = await repo.createUser("facture@exemple.ch", "phrase-de-passe-solide");
    let envoye = null;
    await bienvenue.envoyerBienvenue(
      {
        userId: u.id,
        email: u.email,
        facture: { nom: "FA-2026-0001.pdf", contenu: Buffer.from("%PDF-1.4 test") },
      },
      { repo, sender: { async send(m) { envoye = m; } } },
    );
    assert.equal(envoye.attachments.length, 1);
    assert.equal(envoye.attachments[0].filename, "FA-2026-0001.pdf");
    assert.equal(envoye.attachments[0].contentType, "application/pdf");
  });
});

describe("Demande d'avis par SMS", () => {
  let avis;
  before(async () => { avis = await import("../demandeAvis.ts"); });

  const PLACE = "ChIJN1t_tDeuEmsRUsoyG83frY4";
  const base = { placeId: PLACE, businessName: "Dupont Plomberie" };

  test("le message tient en UN segment GSM-7, lien Google compris", () => {
    // Le lien Google fait 79 caracteres a lui seul. Un accent circonflexe
    // ferait basculer en UCS-2, ou la limite tombe a 70 : le SMS partirait
    // systematiquement en trois segments.
    const corps = avis.composeDemandeAvis(base);
    assert.ok(avis.demandeFitsOneSegment(corps), corps);
    assert.match(corps, /search\.google\.com\/local\/writereview/);
  });

  test("un nom d'entreprise a rallonge ne fait pas basculer a deux segments", () => {
    // Sur un parc qui envoie apres chaque intervention, doubler le nombre de
    // segments double la ligne SMS du compte d'exploitation.
    for (const nom of [
      "Entreprise Generale de Plomberie Sanitaire et Chauffage Dupont et Fils",
      "A".repeat(120),
    ]) {
      const corps = avis.composeDemandeAvis({ ...base, businessName: nom });
      assert.ok(avis.demandeFitsOneSegment(corps), `${corps.length} caracteres`);
    }
  });

  test("marque blanche : le nom MapArtisans n'apparait jamais", () => {
    const corps = avis.composeDemandeAvis({ ...base, brandName: "MonAgence SEO" });
    assert.doesNotMatch(corps, /MapArtisans/);
    assert.match(corps, /MonAgence SEO/);
  });

  test("AUCUN paramètre ne permet de filtrer les destinataires", () => {
    // C'est la garantie centrale du module. Google interdit de « solliciter
    // sélectivement les avis positifs » : offrir le choix du destinataire
    // transformerait cet outil en ce que nous refusons de construire.
    const source = avis.autoriserDemande.toString() + avis.composeDemandeAvis.toString();
    assert.doesNotMatch(source, /satisfait|content|note|rating|etoile/i);
  });

  test("un numéro inutilisable est refusé AVANT tout appel à Twilio", () => {
    const ctx = { clientPhone: "079 pas un numero", placeId: PLACE, desabonne: false, dernierEnvoi: null };
    assert.equal(avis.autoriserDemande(ctx).raison, "numero-invalide");
  });

  test("un désabonnement est refusé, et passe avant toute autre vérification", () => {
    // Un client qui a dit STOP ne doit pas voir son numéro comparé à des dates
    // avant d'être écarté.
    const ctx = { clientPhone: "+41791234567", placeId: PLACE, desabonne: true, dernierEnvoi: null };
    assert.equal(avis.autoriserDemande(ctx).raison, "desabonne");
  });

  test("on ne redemande pas au même client avant 90 jours", () => {
    // Un artisan qui intervient trois fois chez la même personne ne doit pas
    // envoyer trois SMS.
    const maintenant = new Date("2026-09-01T10:00:00Z");
    const recent = { clientPhone: "+41791234567", placeId: PLACE, desabonne: false,
                     dernierEnvoi: new Date("2026-08-15T10:00:00Z") };
    assert.equal(avis.autoriserDemande(recent, maintenant).raison, "deja-sollicite");

    const ancien = { ...recent, dernierEnvoi: new Date("2026-01-01T10:00:00Z") };
    assert.equal(avis.autoriserDemande(ancien, maintenant).ok, true);
  });

  test("une fiche sans place_id ne peut rien envoyer", () => {
    // Le lien serait vide : le client recevrait un SMS qui ne mène nulle part.
    const ctx = { clientPhone: "+41791234567", placeId: null, desabonne: false, dernierEnvoi: null };
    assert.equal(avis.autoriserDemande(ctx).raison, "fiche-sans-place-id");
  });

  test("STOP est reconnu, y compris dans ce qu'écrit vraiment quelqu'un d'agacé", () => {
    // Les opérateurs suisses ne gèrent pas STOP automatiquement comme aux
    // États-Unis : c'est à nous de le faire.
    for (const m of ["STOP", "stop", " Stop. ", "arret", "ARRETER", "unsubscribe", "non"]) {
      assert.equal(avis.estDesabonnement(m), true, m);
    }
    for (const m of ["merci beaucoup", "oui avec plaisir", "c'était parfait"]) {
      assert.equal(avis.estDesabonnement(m), false, m);
    }
  });
});

describe("Registre de désabonnement et historique (dépôt)", () => {
  // `avis` est portée par un autre describe : on réimporte le module ici plutôt
  // que d'élargir sa portée, pour que ce bloc reste déplaçable tel quel.
  let avis;
  before(async () => { avis = await import("../demandeAvis.ts"); });

  /*
   * Ces tests portent sur la PERSISTANCE, pas sur la décision. `autoriserDemande`
   * était déjà correcte et testée ; elle recevait simplement `desabonne: false`
   * écrit en dur et `dernierEnvoi: null`. La logique refusait donc correctement
   * des cas qui ne lui étaient jamais présentés.
   */
  test("un numéro inconnu n'est pas désabonné", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    assert.equal(await repo.estDesabonne("+41790000001"), false);
  });

  test("un STOP enregistré est retenu", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    await repo.enregistrerDesabonnement("+41790000002");
    assert.equal(await repo.estDesabonne("+41790000002"), true);
  });

  test("sans envoi antérieur, aucune date ne bloque", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    assert.equal(await repo.dernierEnvoiAvis("g-001", "+41790000003"), null);
  });

  test("un envoi tracé produit une date, qui déclenche le délai de trois mois", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    await repo.enregistrerDemandeAvis({
      profileId: "g-001",
      clientPhone: "+41790000004",
      statut: "sent",
    });
    const date = await repo.dernierEnvoiAvis("g-001", "+41790000004");
    assert.ok(date instanceof Date, "une date doit être retournée");

    // C'est le branchement qui manquait : la date alimente autoriserDemande.
    const verdict = avis.autoriserDemande({
      clientPhone: "+41790000004",
      placeId: "ChIJexemple",
      desabonne: false,
      dernierEnvoi: date,
    });
    assert.deepEqual(verdict, { ok: false, raison: "deja-sollicite" });
  });

  test("l'historique est cloisonné par fiche", async () => {
    // Deux artisans différents ayant servi le même client ne doivent pas se
    // bloquer mutuellement : le délai protège du harcèlement par UN artisan.
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    await repo.enregistrerDemandeAvis({
      profileId: "g-001",
      clientPhone: "+41790000005",
      statut: "sent",
    });
    assert.equal(await repo.dernierEnvoiAvis("g-002", "+41790000005"), null);
  });
});

describe("Plafond mensuel de SMS", () => {
  /*
   * Le SMS est le seul coût variable non borné du produit : 5 à 10 centimes
   * l'unité, soit dix à cinquante fois une réponse générée par l'IA — dont la
   * dépense est déjà plafonnée. La facture Twilio arrive après coup.
   */
  let quota;
  before(async () => { quota = await import("../quota.ts"); });

  test("les plafonds montent avec le palier", () => {
    const p = quota.PLAFOND_MENSUEL;
    assert.ok(p.basique < p.essentiel, "essentiel doit dépasser basique");
    assert.ok(p.essentiel < p.professionnel, "professionnel doit dépasser essentiel");
  });

  test("un usage normal passe largement", () => {
    // Un artisan qui envoie une demande après chaque intervention reste très
    // en dessous : le plafond arrête l'anormal, pas le quotidien.
    const v = quota.autoriserEnvoi("essentiel", 60, "demande-avis");
    assert.equal(v.ok, true);
    assert.equal(v.proche, false);
  });

  test("au plafond, la demande d'avis est refusée", () => {
    const plafond = quota.PLAFOND_MENSUEL.essentiel;
    const v = quota.autoriserEnvoi("essentiel", plafond, "demande-avis");
    assert.equal(v.ok, false);
    assert.equal(v.raison, "plafond-atteint");
  });

  test("le rapport hebdomadaire N'EST JAMAIS bloqué, même au-delà du plafond", () => {
    // Il coûte 4 à 5 SMS par mois et c'est la promesse vendue à l'artisan.
    // Le couper pour économiser trente centimes reviendrait à ne pas livrer ce
    // qu'il a payé, le mois où il utilise le plus le produit.
    const v = quota.autoriserEnvoi("basique", 10_000, "rapport");
    assert.equal(v.ok, true);
  });

  test("l'alerte de rendez-vous est plafonnée, elle", () => {
    // Un visiteur malveillant enchaînant de fausses demandes ferait sinon
    // partir autant de SMS aux frais de l'artisan.
    const plafond = quota.PLAFOND_MENSUEL.professionnel;
    const v = quota.autoriserEnvoi("professionnel", plafond, "rendez-vous");
    assert.equal(v.ok, false);
  });

  test("l'approche du plafond est signalée avant le blocage", () => {
    const plafond = quota.PLAFOND_MENSUEL.essentiel;
    const v = quota.autoriserEnvoi("essentiel", Math.ceil(plafond * 0.85), "demande-avis");
    assert.equal(v.ok, true, "on prévient, on ne bloque pas encore");
    assert.equal(v.proche, true);
  });

  test("un palier inconnu retombe sur le plus BAS, jamais le plus haut", () => {
    // Le cas se présente si un palier est retiré alors que des comptes le
    // portent encore. Sous-estimer coûte moins cher que l'inverse.
    assert.equal(quota.plafondPour("palier-supprime"), quota.PLAFOND_MENSUEL.basique);
  });

  test("le message dit quand le plafond repart, pas seulement qu'il bloque", () => {
    const m = quota.messageQuota("essentiel");
    assert.match(m, /mois prochain/);
    assert.match(m, new RegExp(String(quota.PLAFOND_MENSUEL.essentiel)));
  });
});

describe("Compteur mensuel (dépôt)", () => {
  test("part de zéro, puis s'incrémente", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    assert.equal(await repo.compterSmsDuMois("c-001"), 0);
    await repo.incrementerSmsDuMois("c-001");
    await repo.incrementerSmsDuMois("c-001");
    assert.equal(await repo.compterSmsDuMois("c-001"), 2);
  });

  test("le compteur est cloisonné par entreprise", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    await repo.incrementerSmsDuMois("c-001");
    assert.equal(await repo.compterSmsDuMois("c-002"), 0);
  });
});

describe("Rappel de fin d'essai", () => {
  /*
   * Envoyé la veille de l'expiration. C'est le SMS le plus cher du produit en
   * proportion : il part vers quelqu'un qui n'a encore rien payé, et c'est lui
   * qui décide de la conversion.
   */
  let rappel;
  before(async () => { rappel = await import("../finEssai.ts"); });

  test("tient en un seul segment", () => {
    const m = rappel.composeRappelEssai();
    assert.ok(
      rappel.rappelFitsOneSegment(m),
      `${m.length} caracteres : ${JSON.stringify(m)}`,
    );
  });

  test("ne répète PAS le nom de l'artisan", () => {
    // Ce SMS s'adresse à l'artisan, pas à ses clients : il sait qui il est.
    // La première version le préfixait, ce qui donnait « MapArtisans : votre
    // essai MapArtisans se termine demain ».
    const m = rappel.composeRappelEssai();
    const occurrences = m.split("MapArtisans").length - 1;
    assert.equal(occurrences, 1, `« MapArtisans » apparaît ${occurrences} fois`);
  });

  test("identifie l'expéditeur en premier", () => {
    // Un SMS d'un numéro inconnu se lit d'abord par son premier mot.
    assert.ok(rappel.composeRappelEssai().startsWith("MapArtisans"));
  });

  test("ne pose AUCUNE question", () => {
    // Aucun traitement des SMS entrants n'existe : l'artisan répondrait dans
    // le vide, la veille d'une décision d'achat.
    const m = rappel.composeRappelEssai();
    assert.ok(!m.includes("?"), `le message ne doit pas interroger : ${m}`);
  });

  test("dit ce qui est CONSERVÉ, pas seulement ce qui s'arrête", () => {
    assert.match(rappel.composeRappelEssai(), /gard/i);
  });

  test("porte un lien vers les formules", () => {
    assert.match(rappel.composeRappelEssai(), /mapartisans\.com\/abonnement/);
  });
});
