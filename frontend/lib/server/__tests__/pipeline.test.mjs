/**
 * Test de bout en bout du pipeline autonome : file → worker → publication →
 * transition de statut — contre un VRAI Redis (binaire éphémère téléchargé par
 * redis-memory-server, aucune installation système requise), et une VRAIE
 * exécution BullMQ, pas une simulation de ses effets.
 *
 * Ce que ce fichier prouve, et ce qu'il ne prouve pas :
 *   · Prouve : l'avis passe bien pending → approved après un aller-retour
 *     réel par la file ; la mise en échec (Google non encore approuvé) est
 *     bien enregistrée ; un avis dont aiAutoReply est coupé n'est jamais
 *     touché, y compris si on l'envoie directement au worker en contournant
 *     le planificateur (vérification en profondeur).
 *   · Ne prouve pas : que l'appel OpenAI réel fonctionne — aucune clé n'est
 *     configurée ici. Le générateur est injecté ; c'est le contrat
 *     `ReplyGenerator`, pas l'implémentation OpenAI, qui est exercé.
 *
 * Exécution : node --test lib/server/__tests__/pipeline.test.mjs
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { RedisMemoryServer } from "redis-memory-server";

// La base doit être calculée ICI, dans le fichier de test — `import.meta.url`
// à l'intérieur du module de hook (chargé depuis une URL `data:`) pointerait
// vers ce data: lui-même, pas vers le projet. C'est ce qui a fait échouer
// silencieusement toute résolution de `@/...` lors du premier essai : les
// imports de reviewWorker.ts (qui importe `@/lib/server/repo`, etc.)
// échouaient dans un bloc try/catch avalé, et ioredis restait ensuite à
// retenter indéfiniment une connexion jamais réellement établie derrière du
// code jamais réellement chargé.
const projectRoot = pathToFileURL(process.cwd() + "/").href;

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const ROOT = ${JSON.stringify(projectRoot)};
      export async function resolve(spec, ctx, next) {
        if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
        if (spec.startsWith("@/")) {
          return next(new URL(spec.slice(2) + ".ts", ROOT).href, ctx);
        }
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

let redisServer, repoMod, queueMod, workerMod, connMod, resilienceMod, geoGridMod;

before(async () => {
  redisServer = new RedisMemoryServer();
  const host = await redisServer.getHost();
  const port = await redisServer.getPort();
  process.env.REDIS_URL = `redis://${host}:${port}`;

  repoMod = await import("../repo.ts");
  queueMod = await import("../queue/reviewQueue.ts");
  workerMod = await import("../queue/reviewWorker.ts");
  connMod = await import("../queue/connection.ts");
  resilienceMod = await import("../resilience.ts");
  geoGridMod = await import("../tracking/geoGrid.ts");
});

after(async () => {
  await queueMod.getReviewReplyQueue().close();
  connMod.__resetConnection();
  await redisServer.stop();
});

/**
 * Vide entièrement la file avant chaque test qui l'utilise.
 *
 * `enqueuePendingReviews` prend `reviewId` comme `jobId` — un choix correct en
 * production (un identifiant réel n'est jamais réutilisé), mais qui entre en
 * collision en test : chaque `__resetRepo()` régénère les mêmes identifiants
 * déterministes (« r-001 »), et BullMQ ne recrée pas un job dont l'identifiant
 * correspond déjà à un job terminé — il faut donc repartir d'une file vide.
 */
async function clearQueue() {
  await queueMod.getReviewReplyQueue().obliterate({ force: true });
}

function waitForJob(worker, jobId, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("délai dépassé")), timeoutMs);
    worker.on("completed", (job) => {
      if (job.id === jobId) {
        clearTimeout(timer);
        resolve("completed");
      }
    });
    worker.on("failed", (job) => {
      if (job?.id === jobId) {
        clearTimeout(timer);
        resolve("failed");
      }
    });
  });
}

// ---------------------------------------------------------------------------
describe("Pipeline avis → IA → publication (BullMQ + Redis réel)", () => {
  test("un avis POSITIF, sur une fiche avec réponse auto, est publié et approuvé", async () => {
    await clearQueue();
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();

    const enqueued = await queueMod.enqueuePendingReviews(repo);
    assert.equal(enqueued, 3, "les 3 avis en attente de g-001 (seule fiche avec réponse auto)");

    const generatedTexts = [];
    const worker = workerMod.createReviewWorker({
      repo,
      generator: {
        async generateReply(ctx) {
          generatedTexts.push(ctx);
          return `Merci pour votre retour à ${ctx.city} !`;
        },
      },
      publisher: { async publishReviewReply() {} }, // simule un Google déjà approuvé
    });

    const outcome = await waitForJob(worker, "r-003");
    await worker.close();

    assert.equal(outcome, "completed");
    const ctx = generatedTexts.find((c) => c.rating === 5 && c.comment);
    assert.ok(ctx, "le contexte de l'avis positif doit avoir été passé au générateur");
    assert.equal(ctx.tradeType, "plombier");
    assert.equal(ctx.city, "Lyon");

    const review = await repo.getReviewById("r-003");
    assert.equal(review.status, "approved");
    assert.equal(review.replyText, "Merci pour votre retour à Lyon !");
  });

  test("sans accès Google approuvé, l'avis est marqué en échec (pas de faux succès)", async () => {
    await clearQueue();
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    await queueMod.enqueuePendingReviews(repo);

    // Aucun publisher injecté : le worker retombe sur defaultResolvePublisher,
    // qui lit googleAccessTokenEnc (null dans les données de départ) et donc
    // sur notYetApprovedPublisher.
    const worker = workerMod.createReviewWorker({
      repo,
      generator: { async generateReply() { return "brouillon généré"; } },
    });

    const outcome = await waitForJob(worker, "r-003");
    await worker.close();

    assert.equal(outcome, "failed");
    const review = await repo.getReviewById("r-003");
    assert.equal(review.status, "failed");
    assert.equal(review.replyText, null, "rien ne doit être écrit comme publié si ça ne l'est pas");
  });

  test("un avis sur une fiche sans réponse auto n'est jamais mis en file", async () => {
    await clearQueue();
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    await queueMod.enqueuePendingReviews(repo);
    const untouched = await repo.getReviewById("r-002"); // g-002, aiAutoReply=false
    assert.equal(untouched.status, "pending", "ni approuvé ni en échec : jamais traité");
  });

  test("défense en profondeur : même envoyé directement au worker, un avis sans réponse auto n'est pas publié", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    let called = false;
    await workerMod.processReviewReplyJob(
      { reviewId: "r-002" },
      { repo, generator: { async generateReply() { called = true; return "x"; } } },
    );
    assert.equal(called, false, "le générateur ne doit même pas être invoqué");
    const review = await repo.getReviewById("r-002");
    assert.equal(review.status, "pending");
  });

  test("un avis déjà traité n'est pas retraité (idempotence)", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    await repo.saveReviewReply("r-003", "déjà répondu manuellement");
    let called = false;
    await workerMod.processReviewReplyJob(
      { reviewId: "r-003" },
      { repo, generator: { async generateReply() { called = true; return "x"; } } },
    );
    assert.equal(called, false);
    assert.equal((await repo.getReviewById("r-003")).replyText, "déjà répondu manuellement");
  });
  test("un avis NÉGATIF n'est jamais publié : brouillon préparé, validation laissée à l'artisan", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();

    let publie = false;
    await workerMod.processReviewReplyJob(
      { reviewId: "r-001" }, // 2 étoiles, sur une fiche où aiAutoReply est ACTIF
      {
        repo,
        generator: { async generateReply() { return "Nous sommes navrés de cette impression."; } },
        publisher: { async publishReviewReply() { publie = true; } },
      },
    );

    assert.equal(publie, false, "rien ne doit partir sur Google sans validation humaine");
    const review = await repo.getReviewById("r-001");
    assert.equal(review.status, "pending", "l'avis reste dans la file « à valider »");
    assert.equal(review.replyText, null, "aucune réponse en ligne");
    assert.equal(
      review.aiReplyDraft,
      "Nous sommes navrés de cette impression.",
      "le brouillon est bien préparé — c'est le service rendu à l'artisan",
    );
  });

  test("le seuil porte sur la note, pas sur la fiche : 3 étoiles reste en validation, 4 passe", async () => {
    // 3 étoiles est une insatisfaction polie : elle mérite la même prudence
    // qu'un avis à 1. C'est la frontière exacte que ce test fige.
    for (const [note, publicationAttendue] of [[3, false], [4, true]]) {
      repoMod.__resetRepo();
      const repo = repoMod.getRepo();
      const avis = await repo.getReviewById("r-001");
      avis.rating = note;

      let publie = false;
      await workerMod.processReviewReplyJob(
        { reviewId: "r-001" },
        {
          repo,
          generator: { async generateReply() { return "reponse"; } },
          publisher: { async publishReviewReply() { publie = true; } },
        },
      );
      assert.equal(publie, publicationAttendue, `note ${note}`);
    }
  });

  test("un avis « étoiles seules » est traité, et le modèle est prévenu qu'il n'y a pas de texte", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();

    let recu;
    await workerMod.processReviewReplyJob(
      { reviewId: "r-004" }, // 5 étoiles, comment: null
      {
        repo,
        generator: { async generateReply(ctx) { recu = ctx; return "Merci pour vos 5 étoiles !"; } },
        publisher: { async publishReviewReply() {} },
      },
    );

    assert.equal(recu.comment, null, "le worker transmet l'absence de texte telle quelle");
    assert.equal((await repo.getReviewById("r-004")).status, "approved");
  });
});


// ---------------------------------------------------------------------------
describe("Rejeu à délai exponentiel", () => {
  test("une RetryableError est rejouée puis finit par réussir", async () => {
    let attempts = 0;
    const delays = [];
    const result = await resilienceMod.withBackoff(
      async (attempt) => {
        attempts = attempt;
        if (attempt < 3) throw new resilienceMod.RetryableError("transitoire", 429);
        return "ok";
      },
      { sleep: async (ms) => void delays.push(ms) },
    );
    assert.equal(result, "ok");
    assert.equal(attempts, 3);
    assert.equal(delays.length, 2, "deux attentes avant le succès à la 3e tentative");
  });

  test("une erreur non transitoire n'est jamais rejouée", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        resilienceMod.withBackoff(
          async () => {
            calls++;
            throw new Error("définitive — mauvaise requête");
          },
          { sleep: async () => {} },
        ),
      /définitive/,
    );
    assert.equal(calls, 1, "aucun rejeu sur une erreur non marquée RetryableError");
  });

  test("le nombre de tentatives est borné", async () => {
    let calls = 0;
    await assert.rejects(() =>
      resilienceMod.withBackoff(
        async () => {
          calls++;
          throw new resilienceMod.RetryableError("toujours transitoire", 503);
        },
        { maxAttempts: 3, sleep: async () => {} },
      ),
    );
    assert.equal(calls, 3);
  });

  test("Retry-After est respecté quand il est fourni", async () => {
    const delays = [];
    await resilienceMod.withBackoff(
      async (attempt) => {
        if (attempt === 1) throw new resilienceMod.RetryableError("quota", 429, 5000);
        return "ok";
      },
      { sleep: async (ms) => delays.push(ms) },
    );
    assert.equal(delays[0], 5000, "le délai serveur prime sur le calcul exponentiel");
  });
});

// ---------------------------------------------------------------------------
describe("Classification Geo-Grid (règle du Local Pack)", () => {
  const cases = [
    [1, "green"], [2, "green"], [3, "green"],
    [4, "amber"], [7, "amber"], [10, "amber"],
    [11, "red"], [40, "red"], [0, "red"], [null, "red"],
  ];
  for (const [position, expected] of cases) {
    test(`position ${position} → ${expected}`, () => {
      assert.equal(geoGridMod.computeGridVisuals(position).color, expected);
    });
  }

  test("le résumé compte correctement chaque zone", () => {
    const points = [
      { label: "A1", area: "x", lat: 0, lng: 0, position: 1, topCompetitorPlaceId: null },
      { label: "A2", area: "x", lat: 0, lng: 0, position: 7, topCompetitorPlaceId: null },
      { label: "A3", area: "x", lat: 0, lng: 0, position: null, topCompetitorPlaceId: null },
    ];
    const summary = geoGridMod.summarizeScan(geoGridMod.classifyScan(points));
    assert.equal(summary.green, 1);
    assert.equal(summary.amber, 1);
    assert.equal(summary.red, 1);
    assert.equal(summary.bestPosition, 1);
  });
});

describe("Le travail de l'IA n'est jamais perdu", () => {
  test("publication en échec : le brouillon reste enregistré", async () => {
    // Chaque generation coute un appel OpenAI facture. La jeter parce que la
    // publication echoue fait repayer au rejeu — constate en production, ou
    // l'acces Google n'est pas encore accorde et TOUS les avis positifs
    // echouent a la publication.
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();

    await assert.rejects(
      workerMod.processReviewReplyJob(
        { reviewId: "r-003" }, // 5 etoiles : passe par la publication
        {
          repo,
          generator: { async generateReply() { return "Merci pour votre confiance !"; } },
          publisher: {
            async publishReviewReply() {
              throw new Error("GOOGLE_BUSINESS_PROFILE_NOT_APPROVED");
            },
          },
        },
      ),
      /NOT_APPROVED/,
    );

    const avis = await repo.getReviewById("r-003");
    assert.equal(avis.status, "failed", "l'echec doit rester visible");
    assert.equal(
      avis.aiReplyDraft,
      "Merci pour votre confiance !",
      "le texte genere doit survivre a l'echec de publication",
    );
    assert.equal(avis.replyText, null, "mais rien ne doit etre marque comme publie");
  });
});
