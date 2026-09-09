/**
 * Script parlé et chaîne de génération.
 *
 * Aucun appel réseau : OpenAI et fal.ai sont injectés. Ce qui est vérifié ici,
 * c'est ce qui coûte de l'argent si ça dérape — la borne de longueur, dont
 * dépend directement la grille tarifaire — et ce qui trahirait le procédé : un
 * texte qui se lit au lieu de s'entendre.
 *
 * Exécution : node --test lib/server/video/__tests__/generation.test.mjs
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

const { LONGUEUR_MAX_SCRIPT, buildScriptPrompt, nettoyerScript, tronquerScript } =
  await import("../script.ts");
const { genererPostVideo } = await import("../generer.ts");

const CONTEXTE = {
  profilId: "profil-plombier-1",
  businessName: "Dupont Plomberie",
  city: "Genève",
  tradeType: "plombier",
  sujet: "urgence",
};

describe("Script parlé", () => {
  test("le prompt impose la borne, et la nomme comme un coût", () => {
    const { system } = buildScriptPrompt(CONTEXTE);
    assert.match(system, new RegExp(String(LONGUEUR_MAX_SCRIPT)));
    assert.match(system, /limite de coût/i);
    assert.match(system, /Genève/);
    // Les interdits qui protègent l'artisan, pas le style.
    for (const interdit of [/aucun prix/i, /jamais un client/i, /superlatif/i]) {
      assert.match(system, interdit);
    }
  });

  test("les guillemets et didascalies disparaissent", () => {
    // Deux travers observés : le modèle encadre la réplique, et glisse des
    // indications de jeu que la synthèse vocale lirait à voix haute.
    assert.equal(nettoyerScript('"Bonjour à tous."'), "Bonjour à tous.");
    assert.equal(nettoyerScript("« Bonjour. »"), "Bonjour.");
    assert.equal(nettoyerScript("[souriant] Bonjour."), "Bonjour.");
    assert.equal(nettoyerScript("Bonjour (chaleureusement) à vous."), "Bonjour à vous.");
  });

  test("la troncature coupe à la phrase, jamais au milieu d'un mot", () => {
    const long = "Première phrase courte. " + "Deuxième phrase beaucoup plus longue. ".repeat(20);
    const coupe = tronquerScript(long, 60);
    assert.ok(coupe.length <= 60, `${coupe.length} caractères`);
    assert.match(coupe, /[.!?]$/, "doit finir sur une ponctuation");
  });

  test("un texte sans ponctuation reste borné", () => {
    // Cas limite : aucune fin de phrase où couper. La borne prime quand même,
    // sinon la vidéo coûte plus cher que prévu.
    const coupe = tronquerScript("mot ".repeat(200), 50);
    assert.ok(coupe.length <= 51, `${coupe.length} caractères`);
  });
});

describe("Chaîne de génération", () => {
  const deps = () => {
    const vus = { image: null, audio: null, resolution: null };
    return {
      vus,
      deps: {
        scriptGenerator: { generate: async () => "Chez Dupont Plomberie, on se déplace." },
        voix: async () => Buffer.from("mp3-factice"),
        lireImage: async () => Buffer.from("png-factice"),
        televerser: async (_o, nom) => `https://v3b.fal.media/${nom}`,
        video: async (image, audio, resolution) => {
          vus.image = image;
          vus.audio = audio;
          vus.resolution = resolution;
          return "https://v3b.fal.media/resultat.mp4";
        },
      },
    };
  };

  test("les quatre étapes s'enchaînent et rendent une vidéo", async () => {
    const { vus, deps: d } = deps();
    const post = await genererPostVideo(CONTEXTE, d);

    assert.equal(post.videoUrl, "https://v3b.fal.media/resultat.mp4");
    assert.match(post.personnage, /^0[1-6]\.png$/);
    assert.equal(vus.resolution, "720p");
    // L'image téléversée est bien celle du personnage attribué.
    assert.equal(vus.image, `https://v3b.fal.media/${post.personnage}`);
    assert.equal(vus.audio, "https://v3b.fal.media/voix.mp3");
  });

  test("le coût est calculé et reste dans l'enveloppe du palier", async () => {
    const { deps: d } = deps();
    const post = await genererPostVideo(CONTEXTE, d);
    // Le palier Basique à 49 CHF absorbe une vidéo mensuelle : au-delà de 3 $
    // pièce, la grille tarifaire ne tient plus.
    assert.ok(post.coutUsd > 0 && post.coutUsd < 3, `${post.coutUsd} $`);
  });

  test("le personnage évite ceux déjà pris dans la même ville", async () => {
    const { deps: d } = deps();
    const seul = await genererPostVideo(CONTEXTE, d);
    const voisin = await genererPostVideo(
      { ...CONTEXTE, personnagesPris: [seul.personnage] },
      d,
    );
    assert.notEqual(voisin.personnage, seul.personnage);
  });

  test("le même profil garde son visage d'un mois sur l'autre", async () => {
    const { deps: d } = deps();
    const janvier = await genererPostVideo(CONTEXTE, d);
    const fevrier = await genererPostVideo(CONTEXTE, d);
    assert.equal(janvier.personnage, fevrier.personnage);
  });
});
