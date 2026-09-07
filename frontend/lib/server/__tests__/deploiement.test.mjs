import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

/**
 * Ces tests relisent le fichier de déploiement, pas du code applicatif.
 *
 * Ils existent à cause d'une panne réelle : .env.production contenait les clés
 * API Twilio, mais docker-compose.yml ne passait que TWILIO_AUTH_TOKEN, qui
 * était vide. Les conteneurs voyaient donc des identifiants entièrement vides,
 * et aucun SMS ne partait — ni le rapport hebdomadaire, ni la demande d'avis.
 *
 * Rien ne signalait la panne : le fichier de configuration avait l'air rempli,
 * les conteneurs étaient sains, les tests passaient. Le typage ne peut pas
 * attraper ça, la variable manquante devient simplement `undefined` à
 * l'exécution, dans un processus que personne ne regarde.
 *
 * D'où une vérification statique : tout ce que l'arbre d'imports d'un service
 * lit dans process.env doit lui être passé.
 */

const COMPOSE = "../deploy/docker-compose.yml";

/** Variables fournies par l'environnement d'exécution, jamais déclarées. */
const FOURNIES_PAR_LA_PLATEFORME = new Set(["NODE_ENV"]);

/**
 * DEMO_DATA n'est volontairement passée à aucun service : c'est le garde-fou
 * qui empêche les données de démonstration d'apparaître en production. Son
 * absence est le comportement voulu, pas un oubli.
 */
const VOLONTAIREMENT_ABSENTES = new Set(["DEMO_DATA"]);

function resoudre(spec, depuis) {
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
  const base = spec.startsWith("@/")
    ? spec.slice(2)
    : normalize(join(dirname(depuis), spec));
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** Toutes les variables lues par un fichier et, récursivement, ses imports. */
function variablesLues(entree) {
  const vues = new Set();
  const variables = new Set();
  const pile = [entree];
  while (pile.length > 0) {
    const f = pile.pop();
    if (vues.has(f) || !existsSync(f)) continue;
    vues.add(f);
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
      variables.add(m[1]);
    }
    for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
      const r = resoudre(m[1], f);
      if (r) pile.push(r);
    }
  }
  return variables;
}

/** Variables listées sous `environment:` pour un service du fichier compose. */
function variablesDuService(service) {
  const lignes = readFileSync(COMPOSE, "utf8").split("\n");
  const fournies = new Set();
  let dansLeService = false;
  for (const ligne of lignes) {
    const entete = /^ {2}([a-z][a-z0-9-]*):/.exec(ligne);
    if (entete) {
      dansLeService = entete[1] === service;
      continue;
    }
    if (!dansLeService) continue;
    const cle = /^ {6}([A-Z_][A-Z0-9_]*):/.exec(ligne);
    if (cle) fournies.add(cle[1]);
  }
  return fournies;
}

/**
 * Points d'entrée du service `app`.
 *
 * ANGLE MORT COMBLÉ.
 *
 * Ce fichier ne couvrait que les trois workers. Le service `app` en était
 * absent — or c'est LUI qui reçoit le webhook Stripe et émet les factures.
 *
 * Constaté en production : FACTURATION_MARQUE était dans .env.production mais
 * pas dans docker-compose.yml. Les factures sont donc parties sans le nom
 * commercial, sous la seule raison sociale — un nom que le client n'a jamais
 * vu. FACTURATION_TVA manquait de même : le jour de l'assujettissement, les
 * factures auraient continué d'annoncer « non assujetti ».
 *
 * Next n'a pas de point d'entrée unique : chaque route et chaque page en est
 * un. On les énumère donc toutes.
 */
function entreesDuServiceApp() {
  const racine = fileURLToPath(new URL("../../../app/", import.meta.url));
  const entrees = [];
  const parcourir = (dossier) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (/^(route|page|layout)\.tsx?$/.test(e.name)) {
        entrees.push(chemin.slice(chemin.indexOf("/app/") + 1));
      }
    }
  };
  parcourir(racine);
  return entrees;
}

const SERVICES = [
  { service: "worker-avis", entree: "lib/server/queue/reviewWorker.ts" },
  { service: "worker-rapports", entree: "lib/server/queue/reportWorker.ts" },
  { service: "planificateur", entree: "workers/planificateur.ts" },
  { service: "app", entrees: entreesDuServiceApp() },
];

for (const { service, entree, entrees } of SERVICES) {
  test(`${service} reçoit toutes les variables que son code lit`, () => {
    const lues = entrees
      ? entrees.reduce((acc, e) => {
          for (const v of variablesLues(e)) acc.add(v);
          return acc;
        }, new Set())
      : variablesLues(entree);
    assert.ok(lues.size > 0, `aucune variable trouvée depuis ${entree}`);

    const fournies = variablesDuService(service);
    assert.ok(fournies.size > 0, `service ${service} introuvable dans ${COMPOSE}`);

    const manquantes = [...lues]
      .filter(
        (v) =>
          !fournies.has(v) &&
          !FOURNIES_PAR_LA_PLATEFORME.has(v) &&
          !VOLONTAIREMENT_ABSENTES.has(v) &&
          /*
           * Les NEXT_PUBLIC_ sont figées dans le bundle A LA CONSTRUCTION, pas
           * lues a l'execution : les passer au conteneur ne changerait rien.
           * Celle du site a de surcroit une valeur de repli dans lib/site.ts.
           */
          !v.startsWith("NEXT_PUBLIC_"),
      )
      .sort();

    assert.deepEqual(
      manquantes,
      [],
      `${service} lit ces variables sans les recevoir : ${manquantes.join(", ")}. ` +
        `Elles vaudront undefined à l'exécution, en silence.`,
    );
  });
}

test("au moins une authentification Twilio est transmise aux envoyeurs de SMS", () => {
  // twilio.ts accepte deux couples : clés API, ou jeton de compte. Passer
  // uniquement celui qu'on ne renseigne pas est exactement la panne d'origine.
  for (const service of ["app", "worker-rapports"]) {
    const fournies = variablesDuService(service);
    assert.ok(
      fournies.has("TWILIO_API_KEY_SID") && fournies.has("TWILIO_API_KEY_SECRET"),
      `${service} doit recevoir les clés API Twilio`,
    );
    assert.ok(
      fournies.has("TWILIO_AUTH_TOKEN"),
      `${service} doit aussi recevoir le jeton de repli`,
    );
  }
});

/**
 * Les pages légales lisent l'identité de l'éditeur dans l'environnement.
 *
 * Constaté en production : prérendues, elles affichaient « Page incomplète »
 * quelle que soit la configuration du serveur. Le `next build` tourne dans
 * l'image Docker, où les variables d'exécution n'existent pas encore — la page
 * figeait donc l'état « rien n'est renseigné », définitivement.
 *
 * C'est une panne silencieuse : le déploiement réussit, la page s'affiche, et
 * seul le contenu est faux. Rien dans la construction ne la signale.
 */
test("les pages légales sont rendues à chaque requête, jamais prérendues", () => {
  const pages = [
    "app/mentions-legales/page.tsx",
    "app/cgv/page.tsx",
    "app/confidentialite/page.tsx",
  ];
  for (const page of pages) {
    const src = readFileSync(page, "utf8");
    assert.match(
      src,
      /export const dynamic = "force-dynamic"/,
      `${page} doit être dynamique : prérendue, elle figerait une identité vide.`,
    );
  }
});

/**
 * Un lien fabriqué doit avoir une page pour l'accueillir.
 *
 * PANNE RÉELLE, constatée sur un vrai courrier de bienvenue.
 *
 * `magicLinkUrl()` construisait `/connexion/lien/{jeton}` depuis l'origine, et
 * l'e-mail portait ce lien. Aucune route ne répondait à cette adresse :
 * l'artisan tombait sur un 404, sans autre moyen d'entrer que de deviner qu'un
 * mot de passe existait — alors que le message lui promettait précisément de
 * ne pas en retenir.
 *
 * Le typage ne pouvait rien voir : d'un côté une chaîne, de l'autre une
 * arborescence de fichiers. Ce test relie les deux.
 */
test("le lien de connexion fabriqué mène à une page qui existe", () => {
  const source = readFileSync(new URL("../magicLink.ts", import.meta.url), "utf8");

  // Le chemin est écrit dans un gabarit : on en extrait la partie fixe.
  const m = source.match(/new URL\(`([^`]*)`/);
  assert.ok(m, "magicLinkUrl doit construire son chemin avec un gabarit");
  const chemin = m[1].replace(/\$\{[^}]*\}/g, "");        // → /connexion/lien/
  const segments = chemin.split("/").filter(Boolean);      // → [connexion, lien]

  /*
   * fileURLToPath et non `.pathname` : le dépôt vit sous « Claude code », et
   * un espace ressort encodé en %20 dans une URL. existsSync cherchait alors
   * un dossier qui n'existe pas, et le test échouait sur un chemin correct.
   */
  const racine = fileURLToPath(new URL("../../../app/", import.meta.url));
  const dossier = join(racine, ...segments);
  assert.ok(
    existsSync(dossier),
    `magicLinkUrl produit ${chemin}{jeton} mais app/${segments.join("/")} n'existe pas`,
  );

  const dynamiques = readdirSync(dossier).filter((f) => f.startsWith("[") && f.endsWith("]"));
  assert.ok(
    dynamiques.length > 0,
    `app/${segments.join("/")} doit contenir un segment dynamique [jeton]`,
  );
  assert.ok(
    existsSync(join(dossier, dynamiques[0], "page.tsx")),
    `app/${segments.join("/")}/${dynamiques[0]} doit contenir une page.tsx`,
  );
});

/** La page seule ne suffit pas : il faut la route qui consomme le jeton. */
test("une route consomme réellement le jeton de connexion", () => {
  const route = fileURLToPath(new URL("../../../app/api/auth/lien/route.ts", import.meta.url));
  assert.ok(existsSync(route), "app/api/auth/lien/route.ts doit exister");
  const source = readFileSync(route, "utf8");
  assert.match(source, /consumeMagicLink/, "la route doit consommer le jeton");
  assert.match(source, /createSession/, "la route doit ouvrir une session");
  // POST et non GET : les filtres anti-hameçonnage ouvrent les liens des
  // messages avant leur destinataire et brûleraient le jeton à usage unique.
  assert.match(source, /export async function POST/, "la consommation doit se faire en POST");
  assert.doesNotMatch(source, /export async function GET/, "un GET brûlerait le jeton");
});
