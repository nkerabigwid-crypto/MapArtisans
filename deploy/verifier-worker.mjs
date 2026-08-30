// Exerce le chemin de production complet : donnees reelles en PostgreSQL,
// mise en file BullMQ, traitement par le worker, ecriture du resultat.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = pathToFileURL(process.cwd() + "/").href;
register("data:text/javascript," + encodeURIComponent(`
  const ROOT = ${JSON.stringify(ROOT)};
  export async function resolve(s, c, n) {
    if (s === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    if (s.startsWith("@/")) return n(new URL(s.slice(2) + ".ts", ROOT).href, c);
    if (s.startsWith(".") && !/\\.[cm]?[jt]s$/.test(s)) { try { return await n(s + ".ts", c); } catch {} }
    return n(s, c);
  }`), pathToFileURL("./"));

const { pgRepo, getPool, closePool } = await import("./lib/server/pgRepo.ts");
const { processReviewReplyJob } = await import("./lib/server/queue/reviewWorker.ts");

let ok = 0;
const t = async (nom, f) => {
  try { await f(); console.log(`  OK   ${nom}`); ok++; }
  catch (e) { console.log(`  ECHEC ${nom}\n        ${e.message}`); process.exitCode = 1; }
};

const p = getPool();
const suffixe = Date.now();

// Jeu de donnees complet : utilisateur -> entreprise -> fiche -> avis.
const { rows: [u] } = await p.query(
  `INSERT INTO users (email, password_hash, phone_number, role)
   VALUES ($1, 'scrypt$x', '+41790000000', 'artisan') RETURNING id`,
  [`worker-${suffixe}@exemple.test`]);
const { rows: [c] } = await p.query(
  `INSERT INTO companies (user_id, company_name, trade_type, plan_id)
   VALUES ($1, 'Plomberie Essai', 'plombier', 'essentiel') RETURNING id`, [u.id]);
const { rows: [g] } = await p.query(
  `INSERT INTO google_profiles (company_id, google_location_id, business_name, city, latitude, longitude, ai_auto_reply)
   VALUES ($1, $2, 'Plomberie Essai', 'Lausanne', 46.5197, 6.6323, true) RETURNING id`,
  [c.id, `loc-${suffixe}`]);
const { rows: [avisPositif] } = await p.query(
  `INSERT INTO reviews (google_profile_id, google_review_id, reviewer_name, rating, comment, status)
   VALUES ($1, $2, 'Sophie L.', 5, 'Intervention rapide et propre.', 'pending') RETURNING id`,
  [g.id, `rev-pos-${suffixe}`]);
const { rows: [avisNegatif] } = await p.query(
  `INSERT INTO reviews (google_profile_id, google_review_id, reviewer_name, rating, comment, status)
   VALUES ($1, $2, 'Marc T.', 2, 'Devis plus eleve qu annonce.', 'pending') RETURNING id`,
  [g.id, `rev-neg-${suffixe}`]);
console.log(`  jeu de donnees cree (fiche ${g.id.slice(0, 8)})`);

await t("le depot relit la fiche et son entreprise", async () => {
  const fiche = await pgRepo.getProfileById(g.id);
  assert.equal(fiche.city, "Lausanne");
  assert.equal(fiche.aiAutoReply, true);
  assert.equal((await pgRepo.getCompanyForProfile(g.id)).tradeType, "plombier");
});

await t("les avis en attente remontent", async () => {
  assert.equal((await pgRepo.listPendingReviews(g.id)).length, 2);
});

await t("AVIS POSITIF : reponse generee ET publiee", async () => {
  let publie = null;
  await processReviewReplyJob({ reviewId: avisPositif.id }, {
    repo: pgRepo,
    generator: { async generateReply(ctx) { return `Merci pour votre retour a ${ctx.city} !`; } },
    publisher: { async publishReviewReply(_, texte) { publie = texte; } },
  });
  assert.ok(publie, "la reponse doit partir chez Google");
  const r = await pgRepo.getReviewById(avisPositif.id);
  assert.equal(r.status, "approved");
  assert.equal(r.replyText, "Merci pour votre retour a Lausanne !");
});

await t("AVIS NEGATIF : brouillon prepare, RIEN publie", async () => {
  let publie = false;
  await processReviewReplyJob({ reviewId: avisNegatif.id }, {
    repo: pgRepo,
    generator: { async generateReply() { return "Nous sommes navres."; } },
    publisher: { async publishReviewReply() { publie = true; } },
  });
  assert.equal(publie, false, "aucune publication sans validation humaine");
  const r = await pgRepo.getReviewById(avisNegatif.id);
  assert.equal(r.status, "pending", "l avis reste a valider");
  assert.equal(r.replyText, null);
  assert.equal(r.aiReplyDraft, "Nous sommes navres.");
});

await t("le rapport hebdomadaire trouve la fiche et son numero", async () => {
  const stats = (await pgRepo.listWeeklyStats()).filter((s) => s.googleProfileId === g.id);
  assert.equal(stats.length, 1, "la fiche doit apparaitre dans la tournee");
  assert.equal(stats[0].phoneNumber, "+41790000000");
  assert.equal(stats[0].businessName, "Plomberie Essai");
  assert.equal(stats[0].pendingReviews, 1, "seul l avis negatif reste en attente");
});

await t("le plafond d etablissements compte les vraies fiches", async () => {
  assert.equal(await pgRepo.countProfilesForUser(u.id), 1);
});

await t("cloisonnement : un autre utilisateur ne voit pas cette fiche", async () => {
  const { rows: [autre] } = await p.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, 'scrypt$x', 'artisan') RETURNING id`,
    [`intrus-${suffixe}@exemple.test`]);
  assert.equal(await pgRepo.findProfileForUser(autre.id, g.id), null,
    "le filtre par proprietaire doit exclure la fiche d autrui");
  assert.equal((await pgRepo.listProfilesForUser(autre.id)).length, 0);
});

await p.query("DELETE FROM users WHERE email LIKE $1", [`%-${suffixe}@exemple.test`]);
console.log("  jeu de donnees supprime (cascade)");
await closePool();
console.log(`\n${ok} verification(s) reussie(s)`);
