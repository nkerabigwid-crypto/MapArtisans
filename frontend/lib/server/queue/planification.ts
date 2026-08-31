// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.

/**
 * Quand déclencher les traitements de fond.
 *
 * CE FICHIER EXISTE PARCE QUE RIEN NE LES DÉCLENCHAIT
 *
 * `enqueuePendingReviews` et `enqueueWeeklyReports` étaient écrits, testés, et
 * n'étaient appelés QUE par les tests. Les deux workers tournaient donc en
 * production, sains, en écoute de files que personne ne remplissait : aucun
 * avis n'était jamais traité, aucun rapport hebdomadaire n'est jamais parti.
 *
 * Rien ne le signalait — pas d'erreur, pas de tâche en échec, des conteneurs
 * verts. C'est le mode de panne le plus coûteux : le produit ne fait rien, et
 * tout indique qu'il fonctionne.
 *
 * POURQUOI UNE BOUCLE ET NON UN « REPEATABLE JOB » BULLMQ
 *
 * Les tâches répétées de BullMQ vivent dans Redis et survivent au code : changer
 * une fréquence laisse l'ancienne planification active, et deux définitions
 * cohabitent silencieusement. Ici, les deux mises en file sont déjà idempotentes
 * — `jobId` = identifiant d'avis pour l'une, semaine ISO pour l'autre — donc une
 * simple boucle qui appelle trop souvent ne peut produire aucun doublon. Le plus
 * simple est aussi le plus sûr.
 */

/** Fréquence de balayage des avis en attente. */
export const INTERVALLE_TICK_MS = 5 * 60_000;

/**
 * Fuseau de référence des envois.
 *
 * Les clients actuels sont suisses. Le jour où le produit servira des artisans
 * hors d'Europe, cette constante devra devenir un réglage par fiche : recevoir
 * son rapport à 4 h du matin est pire que ne pas le recevoir.
 */
export const FUSEAU = "Europe/Zurich";

/** Bornes horaires d'envoi du rapport, incluses. */
export const HEURE_MIN = 8;
export const HEURE_MAX = 10;

interface MomentLocal {
  jour: number; // 1 = lundi … 7 = dimanche
  heure: number;
}

const JOURS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Jour et heure locaux dans le fuseau de référence, quel que soit celui du serveur. */
export function momentLocal(maintenant: Date, fuseau = FUSEAU): MomentLocal {
  const parties = new Intl.DateTimeFormat("en-US", {
    timeZone: fuseau,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(maintenant);

  const weekday = parties.find((p) => p.type === "weekday")?.value ?? "";
  const heure = Number(parties.find((p) => p.type === "hour")?.value ?? "0");
  return { jour: JOURS.indexOf(weekday.toLowerCase()) + 1, heure };
}

/**
 * Faut-il tenter la mise en file des rapports hebdomadaires maintenant ?
 *
 * La fenêtre couvre TOUS les jours ouvrés, pas le seul lundi. La mise en file
 * étant déduplicée par semaine ISO, le premier passage de la semaine est le seul
 * qui produise des jobs : la fenêtre large ne multiplie pas les envois, elle
 * garantit qu'une panne du planificateur un lundi matin ne fait pas sauter la
 * semaine entière. Un rapport reçu mardi vaut mieux qu'un rapport jamais reçu.
 *
 * Le week-end est exclu : un artisan ne veut pas de SMS professionnel le samedi,
 * et un rapport lu le lundi n'a rien perdu de sa valeur.
 */
export function fenetreRapportHebdo(maintenant: Date, fuseau = FUSEAU): boolean {
  const { jour, heure } = momentLocal(maintenant, fuseau);
  if (jour < 1 || jour > 5) return false;
  return heure >= HEURE_MIN && heure <= HEURE_MAX;
}
