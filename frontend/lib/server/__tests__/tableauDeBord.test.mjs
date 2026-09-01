/**
 * Données réelles du tableau de bord.
 *
 * L'écran affichait « Dupont Plomberie, Lyon », ses avis et sa Geo-Grid — pour
 * TOUT LE MONDE. Un artisan fraîchement inscrit voyait l'activité d'une
 * entreprise fictive française à la place de la sienne, et pouvait croire que
 * son compte était mélangé avec celui d'un autre.
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

let tdb, repoMod;
before(async () => {
  tdb = await import("../tableauDeBord.ts");
  repoMod = await import("../repo.ts");
});
beforeEach(() => repoMod.__resetRepo());

describe("Chargement", () => {
  test("un compte sans entreprise renvoie null plutôt qu'un écran à moitié construit", async () => {
    // L'inscription crée toujours utilisateur ET entreprise : ce cas signale
    // une donnée incohérente, pas un état d'attente.
    assert.equal(await tdb.chargerTableauDeBord("u-inexistant"), null);
  });

  test("un compte neuf, sans fiche Google, est un état NORMAL", async () => {
    // C'est l'état de tous les premiers clients tant que l'accès à l'API
    // Google n'est pas accordé.
    const repo = repoMod.getRepo();
    const u = await repo.createUser("neuf@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id,
      companyName: "Serrurerie Exemple",
      tradeType: "serrurier",
      country: "CH",
    });

    const d = await tdb.chargerTableauDeBord(u.id);
    assert.equal(d.sansFiche, true);
    assert.equal(d.profile, null);
    assert.deepEqual(d.reviews, []);
    assert.deepEqual(d.posts, []);
    assert.equal(d.qrCode, null);
  });

  test("le nom affiché est celui de l'artisan, jamais un exemple", async () => {
    const repo = repoMod.getRepo();
    const u = await repo.createUser("nom@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id,
      companyName: "Serrurerie Exemple",
      tradeType: "serrurier",
      country: "CH",
    });

    const d = await tdb.chargerTableauDeBord(u.id);
    assert.equal(d.company.company_name, "Serrurerie Exemple");
    assert.notEqual(d.company.company_name, "Dupont Plomberie");
  });

  test("un compte neuf est « à activer », pas actif ni en essai", async () => {
    const repo = repoMod.getRepo();
    const u = await repo.createUser("essai@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id,
      companyName: "Exemple",
      tradeType: "plombier",
      country: "CH",
    });

    const d = await tdb.chargerTableauDeBord(u.id);
    // `incomplete` : créé, jamais payé. Annoncer un essai qu'on n'offre pas
    // serait une promesse que rien ne tient.
    assert.equal(d.company.subscription_status, "incomplete");
    assert.equal(d.company.plan_id, "basique");
  });

  test("le montant vient de la colonne, pas du catalogue", async () => {
    // Un client garde le tarif auquel il a souscrit même si la grille change.
    const repo = repoMod.getRepo();
    const u = await repo.createUser("tarif@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id,
      companyName: "Exemple",
      tradeType: "plombier",
      country: "CH",
    });
    const d = await tdb.chargerTableauDeBord(u.id);
    assert.equal(typeof d.company.plan_amount, "number");
    assert.ok(d.company.plan_amount > 0);
  });

  test("aucune donnée d'un autre compte ne remonte", async () => {
    const repo = repoMod.getRepo();
    const a = await repo.createUser("a@exemple.test", "mot-de-passe-long-12");
    const b = await repo.createUser("b@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({ userId: a.id, companyName: "Chez A", tradeType: "plombier", country: "CH" });
    await repo.createCompany({ userId: b.id, companyName: "Chez B", tradeType: "taxi", country: "CH" });

    const da = await tdb.chargerTableauDeBord(a.id);
    const db = await tdb.chargerTableauDeBord(b.id);
    assert.equal(da.company.company_name, "Chez A");
    assert.equal(db.company.company_name, "Chez B");
    assert.notEqual(da.company.id, db.company.id);
  });
});

describe("Agenda", () => {
  /*
   * Les rendez-vous étaient ÉCRITS en base et jamais relus. L'artisan recevait
   * un SMS et, s'il le perdait, le rendez-vous était perdu avec — soit
   * exactement le bout de papier que l'assistant devait faire disparaître.
   */
  async function ficheAvecCompte() {
    const repo = repoMod.getRepo();
    const u = await repo.createUser("agenda@exemple.test", "mot-de-passe-long-12");
    const c = await repo.createCompany({
      userId: u.id, companyName: "Ex", tradeType: "plombier", country: "CH",
    });
    const f = await repo.upsertGoogleProfile({
      companyId: c.id,
      googleLocationId: "locations/agenda",
      placeId: "ChIJagenda",
      businessName: "Ex",
      address: null, city: "Sion", latitude: null, longitude: null,
      accessTokenEnc: null, refreshTokenEnc: null,
    });
    return { repo, userId: u.id, ficheId: f.id };
  }

  test("un rendez-vous enregistré est RELU par le tableau de bord", async () => {
    const { repo, userId, ficheId } = await ficheAvecCompte();
    await repo.creerRendezVous({
      profileId: ficheId,
      clientName: "Paul",
      clientPhone: "+41791234567",
      requestedAt: new Date(Date.now() + 86_400_000),
      details: "Fuite sous l'évier",
    });

    const d = await tdb.chargerTableauDeBord(userId);
    assert.equal(d.rendezVous.length, 1);
    assert.equal(d.rendezVous[0].clientName, "Paul");
    assert.equal(d.rendezVous[0].status, "confirmed");
    // Sérialisé : une Date ne traverse pas la frontière serveur/client.
    assert.equal(typeof d.rendezVous[0].requestedAt, "string");
  });

  test("le plus proche vient en premier", async () => {
    // Sur un téléphone consulté entre deux interventions, la seule question
    // est « c'est quoi la suite ».
    const { repo, userId, ficheId } = await ficheAvecCompte();
    const base = Date.now();
    for (const [nom, jours] of [["Loin", 5], ["Proche", 1], ["Moyen", 3]]) {
      await repo.creerRendezVous({
        profileId: ficheId,
        clientName: nom,
        clientPhone: "+41791234567",
        requestedAt: new Date(base + jours * 86_400_000),
      });
    }
    const d = await tdb.chargerTableauDeBord(userId);
    assert.deepEqual(d.rendezVous.map((r) => r.clientName), ["Proche", "Moyen", "Loin"]);
  });

  test("un rendez-vous marqué honoré change de statut", async () => {
    const { repo, userId, ficheId } = await ficheAvecCompte();
    await repo.creerRendezVous({
      profileId: ficheId, clientName: "Paul", clientPhone: "+41791234567",
      requestedAt: new Date(Date.now() + 86_400_000),
    });
    const avant = await tdb.chargerTableauDeBord(userId);
    await repo.majStatutRendezVous({
      rendezVousId: avant.rendezVous[0].id, profileId: ficheId, statut: "honored",
    });
    const apres = await tdb.chargerTableauDeBord(userId);
    assert.equal(apres.rendezVous[0].status, "honored");
  });

  test("l'agenda d'un autre artisan reste inaccessible", async () => {
    const { repo, ficheId } = await ficheAvecCompte();
    await repo.creerRendezVous({
      profileId: ficheId, clientName: "Paul", clientPhone: "+41791234567",
      requestedAt: new Date(Date.now() + 86_400_000),
    });
    const rdv = await repo.listerRendezVous(ficheId);
    await assert.rejects(() =>
      repo.majStatutRendezVous({
        rendezVousId: rdv[0].id,
        profileId: "fiche-d-un-autre",
        statut: "canceled",
      }),
    );
  });

  test("un compte sans fiche a un agenda vide, pas une erreur", async () => {
    const repo = repoMod.getRepo();
    const u = await repo.createUser("vide@exemple.test", "mot-de-passe-long-12");
    await repo.createCompany({
      userId: u.id, companyName: "Ex", tradeType: "plombier", country: "CH",
    });
    const d = await tdb.chargerTableauDeBord(u.id);
    assert.deepEqual(d.rendezVous, []);
  });
});

describe("Répertoire clients", () => {
  /*
   * Il n'existe PAS de table « clients », et c'est délibéré : tenir un fichier
   * clients créerait une base de données personnelles à protéger, déclarer et
   * purger, pour une valeur que les rendez-vous et les demandes d'avis donnent
   * déjà. La liste est donc reconstruite depuis ces deux sources.
   */
  async function ficheAvecCompte() {
    const repo = repoMod.getRepo();
    const u = await repo.createUser("clients@exemple.test", "mot-de-passe-long-12");
    const c = await repo.createCompany({
      userId: u.id, companyName: "Ex", tradeType: "plombier", country: "CH",
    });
    const f = await repo.upsertGoogleProfile({
      companyId: c.id, googleLocationId: "locations/clients", placeId: "ChIJclients",
      businessName: "Ex", address: null, city: "Sion",
      latitude: null, longitude: null, accessTokenEnc: null, refreshTokenEnc: null,
    });
    return { repo, userId: u.id, ficheId: f.id };
  }

  test("un client apparaît dès la première demande d'avis", async () => {
    const { repo, userId, ficheId } = await ficheAvecCompte();
    await repo.enregistrerDemandeAvis({
      profileId: ficheId, clientPhone: "+41791111111", statut: "sent",
    });
    const d = await tdb.chargerTableauDeBord(userId);
    assert.equal(d.clients.length, 1);
    assert.equal(d.clients[0].phone, "+41791111111");
    assert.ok(d.clients[0].dernierAvisDemande, "la date doit être renseignée");
  });

  test("les deux sources se rejoignent sur UNE ligne par numéro", async () => {
    // Un client venu par l'assistant puis sollicité pour un avis ne doit pas
    // apparaître deux fois : l'artisan croirait à un doublon dans ses données.
    const { repo, userId, ficheId } = await ficheAvecCompte();
    await repo.creerRendezVous({
      profileId: ficheId, clientName: "Paul", clientPhone: "+41792222222",
      requestedAt: new Date(Date.now() + 86_400_000),
    });
    await repo.enregistrerDemandeAvis({
      profileId: ficheId, clientPhone: "+41792222222", statut: "sent",
    });
    const d = await tdb.chargerTableauDeBord(userId);
    assert.equal(d.clients.length, 1);
    assert.equal(d.clients[0].name, "Paul", "le nom vient de la source qui l'avait");
  });

  test("un envoi ÉCHOUÉ ne crée pas de client", async () => {
    // Le SMS n'est jamais parti : personne n'a été contacté.
    const { repo, userId, ficheId } = await ficheAvecCompte();
    await repo.enregistrerDemandeAvis({
      profileId: ficheId, clientPhone: "+41793333333",
      statut: "failed", motifEchec: "numéro invalide",
    });
    const d = await tdb.chargerTableauDeBord(userId);
    assert.deepEqual(d.clients, []);
  });

  test("un désabonnement est signalé, pas masqué", async () => {
    // Masquer la ligne ferait croire à une panne : l'artisan réessaierait.
    const { repo, userId, ficheId } = await ficheAvecCompte();
    await repo.enregistrerDemandeAvis({
      profileId: ficheId, clientPhone: "+41794444444", statut: "sent",
    });
    await repo.enregistrerDesabonnement("+41794444444");
    const d = await tdb.chargerTableauDeBord(userId);
    assert.equal(d.clients.length, 1);
    assert.equal(d.clients[0].desabonne, true);
  });

  test("les clients d'un autre artisan ne remontent pas", async () => {
    const { repo, userId, ficheId } = await ficheAvecCompte();
    await repo.enregistrerDemandeAvis({
      profileId: ficheId, clientPhone: "+41795555555", statut: "sent",
    });
    await repo.enregistrerDemandeAvis({
      profileId: "fiche-d-un-autre", clientPhone: "+41796666666", statut: "sent",
    });
    const d = await tdb.chargerTableauDeBord(userId);
    assert.deepEqual(d.clients.map((c) => c.phone), ["+41795555555"]);
  });
});
