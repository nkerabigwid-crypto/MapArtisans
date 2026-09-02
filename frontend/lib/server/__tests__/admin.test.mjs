/**
 * Console d'administration.
 *
 * Ces tests portent d'abord sur ce que la console NE FAIT PAS : elle ne peut
 * rien écrire et ne renvoie aucune donnée personnelle. Une console qui déverse
 * la table `users` devient, le jour d'une intrusion, la fuite elle-même.
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

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

let repoMod;
before(async () => { repoMod = await import("../repo.ts"); });
beforeEach(() => repoMod.__resetRepo());

describe("Statistiques", () => {
  test("ne renvoie QUE des agrégats, aucune ligne nominative", async () => {
    const repo = repoMod.getRepo();
    await repo.createUser("client@exemple.test", "mot-de-passe-long-12");
    const s = await repo.statistiquesAdmin();

    const brut = JSON.stringify(s);
    assert.ok(!brut.includes("client@exemple.test"), "aucune adresse e-mail ne doit sortir");
    assert.ok(!brut.includes("@"), "aucune donnée nominative dans les statistiques");
    for (const v of [s.comptes, s.entreprises, s.fiches, s.avis, s.smsCeMois]) {
      assert.equal(typeof v, "number");
    }
  });

  test("compte les comptes réellement créés", async () => {
    const repo = repoMod.getRepo();
    const avant = (await repo.statistiquesAdmin()).comptes;
    await repo.createUser("a@exemple.test", "mot-de-passe-long-12");
    await repo.createUser("b@exemple.test", "mot-de-passe-long-12");
    assert.equal((await repo.statistiquesAdmin()).comptes, avant + 2);
  });

  test("ventile les abonnements et les paliers", async () => {
    const repo = repoMod.getRepo();
    const u = await repo.createUser("v@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id, companyName: "Ex", tradeType: "plombier", country: "CH",
    });
    const s = await repo.statistiquesAdmin();
    // Un compte neuf naît en essai : c'est ce que le site promet depuis
    // l'origine — sept jours, sans carte bancaire.
    assert.ok(s.abonnements.trialing >= 1);
    assert.ok(s.paliers.basique >= 1);
  });

  test("suit le poste de coût qui monte vraiment : le SMS", async () => {
    // Un SMS coûte dix à cinquante fois une réponse générée par l'IA.
    const repo = repoMod.getRepo();
    await repo.incrementerSmsDuMois("c-001");
    await repo.incrementerSmsDuMois("c-001");
    assert.equal((await repo.statistiquesAdmin()).smsCeMois, 2);
  });

  test("le montant facturé est en centimes, jamais en francs flottants", async () => {
    // Un montant en francs à virgule flottante finit par produire 148.99999.
    const repo = repoMod.getRepo();
    await repo.creerFacture({
      userId: "u-1", clientNom: "x@exemple.test", clientEmail: "x@exemple.test",
      designation: "Abonnement", montantCentimes: 14900, devise: "CHF",
      tvaIde: null, stripeSessionId: "cs_admin",
    });
    const s = await repo.statistiquesAdmin();
    assert.equal(s.montantFactureCentimes, 14900);
    assert.ok(Number.isInteger(s.montantFactureCentimes));
  });
});

describe("Listes nominatives", () => {
  /*
   * La console nomme les ENTREPRISES — savoir qui est en essai, et pas
   * seulement combien, est ce qui permet d'agir avant l'échéance. Elle ne doit
   * jamais nommer les PERSONNES ni donner de quoi les joindre.
   */
  test("une entreprise porte son nom, jamais de coordonnée", async () => {
    const repo = repoMod.getRepo();
    const u = await repo.createUser("artisan@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id,
      companyName: "Toiture du Rhone",
      tradeType: "couvreur",
      country: "CH",
      phoneNumber: "+41780000000",
    });

    const s = await repo.statistiquesAdmin();
    const listes = [...s.abonnes, ...s.essais, ...s.attenteFiche];
    const nom = listes.find((l) => l.entreprise === "Toiture du Rhone");
    assert.ok(nom, "l'entreprise doit apparaître quelque part");

    // La forme elle-même interdit la fuite : trois champs, pas un de plus.
    assert.deepEqual(Object.keys(nom).sort(), ["entreprise", "joursRestants", "palier"]);
    const brut = JSON.stringify(listes);
    assert.ok(!brut.includes("artisan@exemple.test"), "aucune adresse e-mail");
    assert.ok(!brut.includes("41780000000"), "aucun numéro de téléphone");
  });

  test("sans fiche rattachée, l'essai n'est pas démarré", async () => {
    /*
     * Ces comptes n'ont pas de trialEndsAt : ils seraient invisibles partout —
     * ni dans les essais, ni dans les abonnés — sans la liste d'attente. C'est
     * exactement la situation d'un inscrit pendant que Google valide notre
     * accès à son API.
     */
    const repo = repoMod.getRepo();
    const u = await repo.createUser("attente@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id,
      companyName: "Sans Fiche SA",
      tradeType: "plombier",
      country: "CH",
      phoneNumber: "+41780000001",
    });

    const s = await repo.statistiquesAdmin();
    const attente = s.attenteFiche.find((l) => l.entreprise === "Sans Fiche SA");
    assert.ok(attente, "un compte sans fiche doit figurer dans la liste d'attente");
    assert.equal(attente.joursRestants, null, "aucun jour ne doit être consommé");
    assert.ok(
      !s.essais.some((l) => l.entreprise === "Sans Fiche SA"),
      "il ne doit PAS compter comme un essai en cours",
    );
  });

  test("les essais sortent triés par échéance croissante", async () => {
    // Celui qui expire en premier est celui qu'il faut appeler en premier :
    // un tri arbitraire ferait manquer l'échéance la plus proche.
    const s = await repoMod.getRepo().statistiquesAdmin();
    const jours = s.essais.map((l) => l.joursRestants);
    assert.deepEqual(jours, [...jours].sort((a, b) => a - b));
  });

  test("le nombre d'essais listés correspond au compteur", async () => {
    // Un écart entre « Essais en cours : 3 » et une liste de deux lignes
    // ferait douter de toute la page.
    const s = await repoMod.getRepo().statistiquesAdmin();
    assert.equal(s.essais.length, s.essaisEnCours);
    assert.equal(s.abonnes.length, s.abonnesActifs);
  });
});

describe("SMS par client", () => {
  test("le detail par entreprise s'accorde avec le total", async () => {
    /*
     * Le SMS est le seul cout variable non borne du produit. Un total qui ne
     * correspond pas au detail ferait douter du chiffre au moment meme ou on
     * s'en sert pour decider — proposer un palier, ou appeler un client.
     */
    const repo = repoMod.getRepo();
    const u = await repo.createUser("sms@exemple.test", "mot-de-passe-long-12");
    const c = await repo.createCompany({
      userId: u.id,
      companyName: "Depannage Express",
      tradeType: "plombier",
      country: "CH",
    });

    await repo.incrementerSmsDuMois(c.id);
    await repo.incrementerSmsDuMois(c.id);
    await repo.incrementerSmsDuMois(c.id);

    const s = await repo.statistiquesAdmin();
    const ligne = s.smsParEntreprise.find((l) => l.entreprise === "Depannage Express");
    assert.ok(ligne, "l'entreprise doit apparaitre dans le detail");
    assert.equal(ligne.envoyes, 3);
    assert.equal(
      s.smsParEntreprise.reduce((n, l) => n + l.envoyes, 0),
      s.smsCeMois,
      "le detail doit sommer au total",
    );
  });

  test("le plus gros consommateur vient en premier", async () => {
    // C'est lui qui decide de la facture Twilio, et souvent celui a qui
    // proposer le palier au-dessus.
    const repo = repoMod.getRepo();
    const u1 = await repo.createUser("petit@exemple.test", "mot-de-passe-long-12");
    const u2 = await repo.createUser("gros@exemple.test", "mot-de-passe-long-12");
    const petit = await repo.createCompany({
      userId: u1.id, companyName: "Petit", tradeType: "plombier", country: "CH",
    });
    const gros = await repo.createCompany({
      userId: u2.id, companyName: "Gros", tradeType: "plombier", country: "CH",
    });

    await repo.incrementerSmsDuMois(petit.id);
    for (let i = 0; i < 5; i += 1) await repo.incrementerSmsDuMois(gros.id);

    const s = await repo.statistiquesAdmin();
    const noms = s.smsParEntreprise.map((l) => l.entreprise);
    assert.ok(noms.indexOf("Gros") < noms.indexOf("Petit"));
  });

  test("aucune coordonnee dans le detail SMS", async () => {
    // Meme regle que partout ailleurs sur cette page : on nomme l'entreprise,
    // jamais de quoi joindre la personne.
    const repo = repoMod.getRepo();
    const u = await repo.createUser("discret@exemple.test", "mot-de-passe-long-12");
    const c = await repo.createCompany({
      userId: u.id, companyName: "Discret SA", tradeType: "plombier", country: "CH",
    });
    await repo.incrementerSmsDuMois(c.id);

    const s = await repo.statistiquesAdmin();
    assert.ok(!JSON.stringify(s.smsParEntreprise).includes("@"));
  });
});

describe("Rôle", () => {
  test("un compte naît SANS privilège", async () => {
    // Le rôle admin ne s'obtient que depuis le serveur, jamais à l'inscription.
    const repo = repoMod.getRepo();
    const u = await repo.createUser("neuf@exemple.test", "mot-de-passe-long-12");
    assert.equal(u.role, "artisan");
    assert.notEqual(u.role, "admin");
  });
});
