/**
 * Planificateur des traitements de fond.
 *
 * Troisième processus, à côté des deux workers : ceux-ci CONSOMMENT les files,
 * celui-ci les REMPLIT. Sans lui, ils tournent indéfiniment à vide — ce qui
 * était l'état de la production jusqu'ici.
 *
 * Démarrage : npm run planificateur
 */
import { getRepo, type Repo } from "@/lib/server/repo";
import { composeRappelEssai, rappelFitsOneSegment } from "@/lib/server/sms/finEssai";
import { resolveSmsSender } from "@/lib/server/sms/twilio";
import { enqueuePendingReviews } from "@/lib/server/queue/reviewQueue";
import { enqueueWeeklyReports } from "@/lib/server/queue/reportQueue";
import {
  INTERVALLE_TICK_MS,
  fenetreRapportHebdo,
} from "@/lib/server/queue/planification";

/**
 * Rappels de fin d'essai.
 *
 * Envoyés la veille de l'expiration. C'est le SMS le plus cher du produit en
 * proportion : il part vers quelqu'un qui n'a encore rien payé, et c'est lui
 * qui décide de la conversion.
 *
 * Le verrou est en base (`trial_reminder_sent_at`), pas en mémoire : ce
 * processus redémarre à chaque déploiement, et un verrou local renverrait le
 * rappel à chaque redémarrage.
 *
 * Le marquage se fait APRÈS l'envoi réussi. Marquer avant priverait de rappel
 * l'artisan dont le SMS a échoué, et c'est justement le moment où il décide.
 */
async function envoyerRappelsEssai(repo: Repo) {
  const aRappeler = await repo.listerEssaisARappeler();
  if (aRappeler.length === 0) return;

  const sender = resolveSmsSender();
  for (const essai of aRappeler) {
    const message = composeRappelEssai({ businessName: essai.companyName });
    if (!rappelFitsOneSegment(message)) {
      console.error(`[planificateur] rappel à plus d'un segment pour ${essai.companyId}`);
      continue;
    }
    try {
      await sender.send(essai.phoneNumber, message);
      await repo.marquerRappelEssai(essai.companyId);
      await repo.incrementerSmsDuMois(essai.companyId);
      console.log(`[planificateur] rappel de fin d'essai envoyé à ${essai.companyId}`);
    } catch (erreur) {
      // Un échec ne marque rien : le tick suivant réessaiera dans cinq minutes,
      // et il reste vingt-quatre heures de fenêtre.
      console.error(`[planificateur] rappel échoué pour ${essai.companyId} :`, erreur);
    }
  }
}

let enCours = false;
let arret = false;

async function tick() {
  /*
   * Un tick qui déborde ne doit pas en déclencher un second en parallèle : deux
   * balayages simultanés doubleraient les requêtes sur la base sans rien
   * ajouter, les mises en file étant déjà idempotentes.
   */
  if (enCours) {
    console.warn("[planificateur] tick précédent encore en cours, passage ignoré");
    return;
  }
  enCours = true;
  try {
    const repo = getRepo();

    const avis = await enqueuePendingReviews(repo);
    if (avis > 0) console.log(`[planificateur] ${avis} avis mis en file`);

    await envoyerRappelsEssai(repo);

    if (fenetreRapportHebdo(new Date())) {
      const rapports = await enqueueWeeklyReports(repo);
      // Zéro est le cas NORMAL une fois la semaine déjà traitée : la
      // déduplication par semaine ISO fait que seul le premier passage produit
      // des jobs. On ne le journalise donc pas, pour ne pas noyer les vrais
      // événements sous un message toutes les cinq minutes.
      if (rapports > 0) {
        console.log(`[planificateur] ${rapports} rapports hebdomadaires mis en file`);
      }
    }
  } catch (erreur) {
    /*
     * On journalise sans relancer : une base momentanément injoignable ne doit
     * pas tuer le planificateur. Le tick suivant réessaiera dans cinq minutes,
     * et les mises en file idempotentes rattraperont ce qui a été manqué.
     */
    console.error("[planificateur] tick en échec :", erreur);
  } finally {
    enCours = false;
  }
}

console.log(
  `[planificateur] démarré, balayage toutes les ${INTERVALLE_TICK_MS / 60_000} minutes`,
);

// Un premier passage immédiat : au redéploiement, les avis arrivés pendant
// l'indisponibilité sont repris sans attendre le premier intervalle.
void tick();
const minuterie = setInterval(() => void tick(), INTERVALLE_TICK_MS);

async function shutdown(signal: string) {
  if (arret) return;
  arret = true;
  console.log(`[planificateur] signal ${signal} reçu, arrêt en cours…`);
  clearInterval(minuterie);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
