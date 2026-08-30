// Verification du depot PostgreSQL contre la vraie base.
// Execution sur le serveur, dans un conteneur joint au reseau interne.
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

const { pgRepo, closePool } = await import("./lib/server/pgRepo.ts");
const { createMagicLink, hashMagicToken, evaluerLien } = await import("./lib/server/magicLink.ts");
const { verifyPassword } = await import("./lib/server/password.ts");

let ok = 0;
const t = async (nom, f) => {
  try { await f(); console.log(`  OK   ${nom}`); ok++; }
  catch (e) { console.log(`  ECHEC ${nom}\n        ${e.message}`); process.exitCode = 1; }
};

const email = `verif-${Date.now()}@exemple.test`;

await t("createUser ecrit reellement en base", async () => {
  const u = await pgRepo.createUser(email, "motdepasse-de-verification");
  assert.ok(u.id, "un identifiant doit etre attribue");
  assert.equal(u.email, email);
  assert.equal(u.role, "artisan");
});

await t("findUserByEmail relit ce qui a ete ecrit", async () => {
  const u = await pgRepo.findUserByEmail(email);
  assert.ok(u, "utilisateur introuvable apres creation");
  assert.ok(await verifyPassword("motdepasse-de-verification", u.passwordHash),
    "le mot de passe hache doit se verifier");
});

await t("la casse de l'adresse ne cree pas deux comptes", async () => {
  assert.ok(await pgRepo.findUserByEmail(email.toUpperCase()));
});

await t("findUserById", async () => {
  const u = await pgRepo.findUserByEmail(email);
  assert.equal((await pgRepo.findUserById(u.id)).email, email);
});

await t("un utilisateur sans fiche en compte zero", async () => {
  const u = await pgRepo.findUserByEmail(email);
  assert.equal(await pgRepo.countProfilesForUser(u.id), 0);
  assert.deepEqual(await pgRepo.listProfilesForUser(u.id), []);
});

await t("lien magique : ecriture, consommation atomique, rejeu refuse", async () => {
  const u = await pgRepo.findUserByEmail(email);
  const { token, record } = await createMagicLink(u.id);
  await pgRepo.saveMagicLink(record);
  const h = await hashMagicToken(token);

  const premier = evaluerLien(await pgRepo.consumeMagicLink(h));
  assert.equal(premier.ok, true, "la premiere consommation doit reussir");
  assert.equal(premier.userId, u.id);

  const second = evaluerLien(await pgRepo.consumeMagicLink(h));
  assert.equal(second.ok, false, "le rejeu doit echouer");
  assert.equal(second.raison, "deja-utilise");
});

await t("un jeton inconnu ne correspond a rien", async () => {
  assert.equal(await pgRepo.consumeMagicLink("0".repeat(64)), null);
});

await t("listWeeklyStats s'execute sur le schema reel", async () => {
  const s = await pgRepo.listWeeklyStats();
  assert.ok(Array.isArray(s), "doit renvoyer un tableau");
});

await t("listProfilesWithAutoReplyEnabled s'execute", async () => {
  assert.ok(Array.isArray(await pgRepo.listProfilesWithAutoReplyEnabled()));
});

await t("findAgencyByDomain sur domaine inconnu", async () => {
  assert.equal(await pgRepo.findAgencyByDomain("inexistant.example"), null);
});

await t("un avis inexistant echoue bruyamment", async () => {
  await assert.rejects(
    pgRepo.saveReviewReply("00000000-0000-0000-0000-000000000000", "x"),
    /Avis introuvable/,
  );
});

// Menage : on ne laisse pas de compte de verification dans la base.
const { getPool } = await import("./lib/server/pgRepo.ts");
await getPool().query("DELETE FROM users WHERE email LIKE 'verif-%@exemple.test'");
await closePool();
console.log(`\n${ok} verification(s) reussie(s)`);
