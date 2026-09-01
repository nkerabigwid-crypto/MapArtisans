/**
 * Facturation suisse — TVA, numérotation, PDF.
 * Exécution : node --experimental-strip-types --test lib/server/billing/__tests__/billing.test.mjs
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

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

let vat, num, inv;
before(async () => {
  vat = await import("../vat.ts");
  num = await import("../invoiceNumber.ts");
  inv = await import("../invoice.ts");
});

describe("TVA suisse", () => {
  test("non assujetti : AUCUNE TVA n'apparaît, c'est une obligation légale", () => {
    // Sous 100 000 CHF de chiffre d'affaires, faire figurer la TVA reviendrait
    // à percevoir un impôt qu'on n'a pas le droit d'encaisser.
    const t = vat.calculerTotaux(4900, { assujetti: false });
    assert.equal(t.tvaCentimes, 0);
    assert.equal(t.taux, null);
    assert.equal(t.ttcCentimes, 4900);
    assert.equal(t.htCentimes, 4900);
  });

  test("assujetti, prix TTC : la TVA est extraite et le total ne bouge pas", () => {
    // Le client déjà abonné à 49 CHF continue de payer 49 CHF.
    const t = vat.calculerTotaux(4900, { assujetti: true, numeroIde: "CHE-123.456.789 TVA" });
    assert.equal(t.ttcCentimes, 4900, "le montant encaissé est inchangé");
    assert.equal(t.htCentimes + t.tvaCentimes, 4900, "HT + TVA doit redonner exactement le TTC");
    assert.equal(t.taux, 0.081);
  });

  test("assujetti, prix HT : la TVA s'ajoute", () => {
    const t = vat.calculerTotaux(4900, { assujetti: true, numeroIde: "CHE-123.456.789" }, "ht");
    assert.equal(t.htCentimes, 4900);
    assert.equal(t.tvaCentimes, Math.round(4900 * 0.081));
    assert.equal(t.ttcCentimes, 4900 + t.tvaCentimes);
  });

  test("HT + TVA redonne toujours le TTC, sur toute la plage de montants", () => {
    // C'est LA propriété qu'un fiduciaire vérifie. Un arrondi séparé sur le HT
    // et sur la TVA la casse d'un centime une fois sur deux.
    const regime = { assujetti: true, numeroIde: "CHE-123.456.789 TVA" };
    for (let c = 1; c <= 20000; c++) {
      const t = vat.calculerTotaux(c, regime);
      assert.equal(t.htCentimes + t.tvaCentimes, t.ttcCentimes, `montant ${c}`);
    }
  });

  test("un IDE malformé fait échouer l'émission, pas passer une facture non conforme", () => {
    assert.throws(
      () => vat.calculerTotaux(4900, { assujetti: true, numeroIde: "123456" }),
      /IDE invalide/,
    );
  });

  test("les montants sont des entiers de centimes, jamais des francs flottants", () => {
    assert.throws(() => vat.calculerTotaux(49.9, { assujetti: false }), /Montant invalide/);
    assert.throws(() => vat.calculerTotaux(-100, { assujetti: false }), /Montant invalide/);
  });

  test("le seuil d'assujettissement est bien à 100 000 CHF", () => {
    assert.equal(vat.doitSAssujettir(99_999_99), false);
    assert.equal(vat.doitSAssujettir(100_000_00), true);
  });

  test("formatCHF produit deux décimales", () => {
    assert.equal(vat.formatCHF(4900), "49.00");
    assert.equal(vat.formatCHF(5297), "52.97");
    assert.equal(vat.formatCHF(5), "0.05");
  });
});

describe("Numérotation des factures", () => {
  test("le premier numéro d'une année neuve est 0001", () => {
    const r = num.prochainNumero(null, new Date("2026-03-04"));
    assert.equal(r.numero, "FA-2026-0001");
  });

  test("la série repart à 1 au changement d'année", () => {
    // Un compteur global donnerait FA-2027-0148 comme première facture de 2027.
    const r = num.prochainNumero({ annee: 2026, dernier: 147 }, new Date("2027-01-02"));
    assert.equal(r.numero, "FA-2027-0001");
  });

  test("elle s'incrémente dans l'année", () => {
    const r = num.prochainNumero({ annee: 2026, dernier: 147 }, new Date("2026-12-31"));
    assert.equal(r.numero, "FA-2026-0148");
  });

  test("un trou dans la série est détecté", () => {
    // C'est exactement ce qu'un fiduciaire contrôle en fin d'exercice.
    const trous = num.trouverTrous(["FA-2026-0001", "FA-2026-0002", "FA-2026-0004"]);
    assert.deepEqual(trous, ["FA-2026-0003"]);
  });

  test("une série continue ne signale rien", () => {
    assert.deepEqual(num.trouverTrous(["FA-2026-0001", "FA-2026-0002"]), []);
  });

  test("un numéro malformé dans la série est signalé, pas ignoré", () => {
    assert.throws(() => num.trouverTrous(["FA-2026-0001", "12345"]), /malformé/);
  });

  test("le dépassement du format échoue bruyamment", () => {
    assert.throws(() => num.formatInvoiceNumber(2026, 10000), /au-delà du format/);
  });
});

describe("Génération du PDF", () => {
  const base = {
    numero: "FA-2026-0001",
    emiseLe: new Date("2026-08-29"),
    payeeLe: new Date("2026-08-29"),
    // Émetteur fictif : l'identité juridique réelle vient de la configuration,
    // jamais du code source (voir la suite « Autonomie de la marque »).
    emetteur: { raisonSociale: "Societe Emettrice SA", adresse: ["Rue de Test 1", "1000 Lausanne"] },
    client: {
      raisonSociale: "Dupont Plomberie",
      adresse: ["Av. des Artisans 3", "1003 Lausanne"],
      email: "dupont@example.ch",
    },
    designation: "Abonnement mensuel MapArtisans — formule Essentiel",
    montantCentimes: 4900,
  };

  test("un PDF valide est produit", async () => {
    const pdf = await inv.genererFacturePdf({ ...base, regime: { assujetti: false } });
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", "en-tête PDF");
    assert.ok(pdf.length > 800, `PDF suspicieusement petit : ${pdf.length} octets`);
  });

  test("le PDF assujetti est produit avec l'IDE", async () => {
    const pdf = await inv.genererFacturePdf({
      ...base,
      regime: { assujetti: true, numeroIde: "CHE-123.456.789 TVA" },
    });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  });

  test("un IDE invalide empêche l'émission du PDF", async () => {
    await assert.rejects(
      inv.genererFacturePdf({ ...base, regime: { assujetti: true, numeroIde: "nimporte quoi" } }),
      /IDE invalide/,
    );
  });
});

describe("Configuration de facturation", () => {
  let config;
  before(async () => { config = await import("../config.ts"); });

  test("sans IDE configuré : NON ASSUJETTI — c'est l'état actuel et le défaut sûr", () => {
    // État confirmé le 29 août 2026 : chiffre d'affaires sous 100 000 CHF.
    delete process.env.FACTURATION_IDE;
    assert.deepEqual(config.regimeTvaCourant(), { assujetti: false });
  });

  test("l'IDE SEUL ne rend pas assujetti", () => {
    /*
     * Toute entreprise inscrite au registre du commerce reçoit un IDE, y
     * compris une raison individuelle très en dessous du seuil de 100 000 CHF.
     * Déduire l'assujettissement de l'IDE ferait apparaître de la TVA sur les
     * factures d'un non-assujetti — et en percevoir sans être inscrit au
     * registre des assujettis est une infraction.
     */
    process.env.FACTURATION_IDE = "CHE-307.804.188";
    delete process.env.FACTURATION_TVA;
    assert.deepEqual(config.regimeTvaCourant(), { assujetti: false });
    delete process.env.FACTURATION_IDE;
  });

  test("c'est le numéro de TVA qui fait basculer", () => {
    process.env.FACTURATION_TVA = "CHE-123.456.789 TVA";
    assert.deepEqual(config.regimeTvaCourant(), {
      assujetti: true,
      numeroIde: "CHE-123.456.789 TVA",
    });
    delete process.env.FACTURATION_TVA;
  });

  test("aucun état « assujetti sans IDE » n'est représentable", () => {
    // Un drapeau booléen séparé permettrait une facture assujettie sans
    // numéro, c'est-à-dire non conforme. Lier l'assujettissement au numéro de
    // TVA rend ce cas impossible.
    process.env.FACTURATION_TVA = "   ";
    assert.equal(config.regimeTvaCourant().assujetti, false);
    delete process.env.FACTURATION_IDE;
  });

  test("l'identité de l'émetteur n'a pas de valeur par défaut", () => {
    // Une facture au mauvais nom n'est pas rectifiable une fois partie chez le
    // client et dans sa comptabilité.
    delete process.env.FACTURATION_RAISON_SOCIALE;
    assert.throws(() => config.emetteurCourant(), /FACTURATION_RAISON_SOCIALE absente/);
  });

  test("l'adresse se découpe en lignes", () => {
    process.env.FACTURATION_RAISON_SOCIALE = "Emetteur SA";
    process.env.FACTURATION_ADRESSE = "Rue de Test 1 | 1000 Lausanne | Suisse";
    assert.deepEqual(config.emetteurCourant().adresse, ["Rue de Test 1", "1000 Lausanne", "Suisse"]);
    delete process.env.FACTURATION_RAISON_SOCIALE;
    delete process.env.FACTURATION_ADRESSE;
  });
});

describe("Émission après paiement", () => {
  /*
   * Le générateur PDF, la numérotation et la configuration de l'émetteur étaient
   * écrits et testés — et importés par AUCUN code de production. Un client qui
   * payait ne recevait aucune facture. Ces tests couvrent le branchement.
   */
  let emission, repoMod;
  before(async () => {
    emission = await import("../emission.ts");
    repoMod = await import("../../repo.ts");
    process.env.FACTURATION_RAISON_SOCIALE = "MapArtisans Exemple";
    process.env.FACTURATION_ADRESSE = "Rue Exemple 1 | 1000 Ville | Suisse";
    process.env.FACTURATION_EMAIL = "contact@exemple.test";
    delete process.env.FACTURATION_IDE;
  });

  function senderFactice() {
    const envois = [];
    return { envois, send: async (m) => void envois.push(m) };
  }

  test("émet une facture, la joint en PDF et l'envoie", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    const sender = senderFactice();

    const numero = await emission.emettreFacture(
      { repo, userId: "u-1", email: "client@exemple.test", planId: "basique", stripeSessionId: "cs_1" },
      { sender },
    );

    assert.match(numero, /^FA-\d{4}-\d{4}$/, "numéro au format attendu");
    assert.equal(sender.envois.length, 1);
    const [envoi] = sender.envois;
    assert.equal(envoi.to, "client@exemple.test");
    assert.equal(envoi.attachments.length, 1);
    assert.equal(envoi.attachments[0].contentType, "application/pdf");
    // Un PDF commence par %PDF- : sans ce contrôle, un Buffer vide passerait.
    assert.equal(envoi.attachments[0].content.subarray(0, 5).toString(), "%PDF-");
  });

  test("un webhook rejoué ne produit pas une seconde facture", async () => {
    // Stripe rejoue jusqu'à trois jours. Deux factures pour un paiement, c'est
    // une erreur comptable que le client découvre avant nous.
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    const sender = senderFactice();
    const args = { repo, userId: "u-1", email: "c@exemple.test", planId: "basique", stripeSessionId: "cs_2" };

    const a = await emission.emettreFacture(args, { sender });
    const b = await emission.emettreFacture(args, { sender });
    assert.equal(a, b, "le même numéro doit être réutilisé");
  });

  test("deux paiements reçoivent deux numéros distincts et consécutifs", async () => {
    repoMod.__resetRepo();
    const repo = repoMod.getRepo();
    const sender = senderFactice();

    const a = await emission.emettreFacture(
      { repo, userId: "u-1", email: "a@exemple.test", planId: "basique", stripeSessionId: "cs_a" },
      { sender },
    );
    const b = await emission.emettreFacture(
      { repo, userId: "u-2", email: "b@exemple.test", planId: "essentiel", stripeSessionId: "cs_b" },
      { sender },
    );
    assert.notEqual(a, b);
    const seqA = Number(a.slice(-4));
    const seqB = Number(b.slice(-4));
    assert.equal(seqB, seqA + 1, "la série doit être continue");
  });

  test("un plan inconnu n'émet AUCUNE facture plutôt qu'une facture à zéro", async () => {
    // Un document faux ne se retire pas de la comptabilité du client.
    repoMod.__resetRepo();
    const sender = senderFactice();
    const numero = await emission.emettreFacture(
      { repo: repoMod.getRepo(), userId: "u-1", email: "x@exemple.test", planId: "inexistant", stripeSessionId: "cs_x" },
      { sender },
    );
    assert.equal(numero, null);
    assert.equal(sender.envois.length, 0);
  });

  test("ne lève jamais : un échec d'envoi ne doit pas faire rejouer le paiement", async () => {
    repoMod.__resetRepo();
    const sender = { send: async () => { throw new Error("SMTP indisponible"); } };
    const numero = await emission.emettreFacture(
      { repo: repoMod.getRepo(), userId: "u-1", email: "y@exemple.test", planId: "basique", stripeSessionId: "cs_y" },
      { sender },
    );
    // La facture reste en base avec envoyee_le à NULL : l'envoi se rattrape.
    assert.equal(numero, null, "l'échec est signalé par null, pas par une exception");
  });
});
