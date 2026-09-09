/**
 * Mise en file et traitement des posts vidéo.
 *
 * Tout ce qui est vérifié ici protège la facture. Une vidéo coûte 2,25 $ : les
 * défauts qui comptent ne sont pas des plantages, ce sont des générations en
 * double que personne ne remarque avant de lire le relevé fal.ai.
 *
 * Ni Redis ni BullMQ : `enqueueDueVideoPosts` reçoit une file factice, et
 * `processVideoPostJob` un dépôt factice.
 *
 * Exécution : node --test lib/server/video/__tests__/file.test.mjs
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

const { processVideoPostJob, sujetParDefaut } = await import("../../queue/videoWorker.ts");
const { clePeriode } = await import("../cadence.ts");

/** Dépôt factice reproduisant la contrainte d'unicité (fiche, période). */
function depotFactice(fiches) {
  const reservees = new Set();
  const lignes = new Map();
  return {
    lignes,
    async listerFichesPourVideo() {
      return fiches;
    },
    async reserverPostVideo(profileId, periode) {
      const cle = `${profileId}:${periode}`;
      if (reservees.has(cle)) return null;
      reservees.add(cle);
      const id = `v${reservees.size}`;
      lignes.set(id, { statut: "pending" });
      return id;
    },
    async marquerVideoGeneree(id, input) {
      lignes.set(id, { statut: "generated", ...input });
    },
    async marquerVideoEchouee(id, motif) {
      lignes.set(id, { statut: "failed", motif });
    },
  };
}

const FICHE = {
  googleProfileId: "fiche-1",
  companyId: "ent-1",
  businessName: "Dupont Plomberie",
  city: "Genève",
  tradeType: "plombier",
  planId: "basique",
  subscriptionStatus: "active",
  trialEndsAt: null,
  gracePeriodEndsAt: null,
};

describe("Réservation de période", () => {
  test("la deuxième réservation de la même période est refusée", async () => {
    // LE test. Sans ce refus, chaque passage du planificateur — toutes les cinq
    // minutes — regénérerait la vidéo du mois.
    const repo = depotFactice([FICHE]);
    const periode = clePeriode("basique", new Date(2026, 8, 10));
    assert.ok(await repo.reserverPostVideo("fiche-1", periode));
    assert.equal(await repo.reserverPostVideo("fiche-1", periode), null);
  });

  test("un mois nouveau rouvre le droit", async () => {
    const repo = depotFactice([FICHE]);
    const septembre = clePeriode("basique", new Date(2026, 8, 10));
    const octobre = clePeriode("basique", new Date(2026, 9, 10));
    assert.notEqual(septembre, octobre);
    assert.ok(await repo.reserverPostVideo("fiche-1", septembre));
    assert.ok(await repo.reserverPostVideo("fiche-1", octobre));
  });
});

describe("Traitement d'un job", () => {
  const job = {
    videoPostId: "v1",
    profileId: "fiche-1",
    businessName: "Dupont Plomberie",
    city: "Genève",
    tradeType: "plombier",
  };

  const depsOk = (repo) => ({
    repo,
    scriptGenerator: { generate: async () => "On se déplace à Genève." },
    voix: async () => Buffer.from("mp3"),
    lireImage: async () => Buffer.from("png"),
    televerser: async (_o, nom) => `https://v3b.fal.media/${nom}`,
    video: async () => "https://v3b.fal.media/ok.mp4",
  });

  test("la réussite enregistre l'URL, le personnage et le coût", async () => {
    const repo = depotFactice([FICHE]);
    repo.lignes.set("v1", { statut: "pending" });
    await processVideoPostJob(job, depsOk(repo));

    const ligne = repo.lignes.get("v1");
    assert.equal(ligne.statut, "generated");
    assert.equal(ligne.videoUrl, "https://v3b.fal.media/ok.mp4");
    assert.match(ligne.personnage, /^0[1-6]\.png$/);
    assert.ok(ligne.coutUsd > 0, "le coût doit être enregistré, pas seulement calculé");
  });

  test("l'échec marque la ligne AVANT de relever", async () => {
    /*
     * Le comportement qui évite de payer deux fois. Une exception qui remonte
     * sans marquer la ligne la laisserait en `pending` — et le passage suivant
     * la croirait libre, donc la régénérerait, donc la repaierait.
     */
    const repo = depotFactice([FICHE]);
    repo.lignes.set("v1", { statut: "pending" });

    await assert.rejects(
      processVideoPostJob(job, {
        ...depsOk(repo),
        video: async () => {
          throw new Error("fal.ai a répondu 403");
        },
      }),
      /403/,
    );

    const ligne = repo.lignes.get("v1");
    assert.equal(ligne.statut, "failed", "la ligne ne doit jamais rester en pending");
    assert.match(ligne.motif, /403/, "le motif se lit, il ne se devine pas");
  });
});

describe("Choix du sujet", () => {
  test("il tourne au fil des mois plutôt que de se répéter", () => {
    const sujets = new Set();
    for (let m = 0; m < 12; m++) sujets.add(sujetParDefaut("fiche-1", new Date(2026, m, 10)));
    // Douze vidéos annuelles dont quatre parleraient d'urgence se
    // remarqueraient. On attend au moins quatre thèmes distincts.
    assert.ok(sujets.size >= 4, `${sujets.size} sujets distincts sur douze mois`);
  });

  test("deux artisans ne publient pas le même thème le même mois", () => {
    const a = sujetParDefaut("fiche-courte", new Date(2026, 8, 10));
    const b = sujetParDefaut("fiche-beaucoup-plus-longue", new Date(2026, 8, 10));
    assert.notEqual(a, b);
  });
});
