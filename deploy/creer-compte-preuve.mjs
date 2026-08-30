import { register } from "node:module";
import { pathToFileURL } from "node:url";
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
const u = await pgRepo.createUser(process.env.EMAIL_PREUVE, "MotDePasseDePreuve-2026");
console.log(`  compte cree : ${u.email} (${u.id})`);
await closePool();
