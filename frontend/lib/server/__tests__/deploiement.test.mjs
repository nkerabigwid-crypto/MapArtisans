import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

const SERVICES = [
  { service: "worker-avis", entree: "lib/server/queue/reviewWorker.ts" },
  { service: "worker-rapports", entree: "lib/server/queue/reportWorker.ts" },
  { service: "planificateur", entree: "workers/planificateur.ts" },
];

for (const { service, entree } of SERVICES) {
  test(`${service} reçoit toutes les variables que son code lit`, () => {
    const lues = variablesLues(entree);
    assert.ok(lues.size > 0, `aucune variable trouvée depuis ${entree}`);

    const fournies = variablesDuService(service);
    assert.ok(fournies.size > 0, `service ${service} introuvable dans ${COMPOSE}`);

    const manquantes = [...lues]
      .filter(
        (v) =>
          !fournies.has(v) &&
          !FOURNIES_PAR_LA_PLATEFORME.has(v) &&
          !VOLONTAIREMENT_ABSENTES.has(v),
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
