// PAS de `import "server-only"` ici, volontairement : ce module est aussi
// importé par workers/reviewWorker.ts, qui tourne comme un processus Node
// autonome, hors du bundler de Next. Le paquet `server-only` lève de façon
// INCONDITIONNELLE dès qu'il est chargé ailleurs que sous le bundler de Next
// (c'est ce dernier, et lui seul, qui sait le neutraliser) — l'ajouter ici
// ferait planter le worker au démarrage. La frontière réelle est déjà tenue
// autrement : rien sous lib/server/ n'est importé par un composant "use
// client" (vérifié), et chaque route Next qui l'utilise déclare elle-même
// `export const runtime = "nodejs"`.
import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "./connection";
import { REVIEW_REPLY_QUEUE, type ReviewReplyJobData } from "./reviewQueue";
import { getRepo, type Repo } from "@/lib/server/repo";
import { decryptToken } from "@/lib/server/crypto";
import { openAiReplyGenerator, type ReplyGenerator } from "@/lib/server/ai/openai";
// Seuil partagé avec le générateur : voir reviewPolicy.ts pour le pourquoi.
import { AUTO_REPLY_MIN_RATING, estAvisPositif } from "@/lib/server/reviewPolicy";
export { AUTO_REPLY_MIN_RATING };
import {
  notYetApprovedPublisher,
  createGooglePublisher,
  type GooglePublisher,
} from "@/lib/server/googleBusinessProfile";

/**
 * Flux complet, pour un avis : IA → publication → statut.
 *
 * `deps` est injectable — c'est ce qui permet de tester le pipeline en entier
 * (file → worker → transition d'état) sans dépendre d'une vraie clé OpenAI ni
 * d'un accès Google approuvé. La production appelle `createReviewWorker()`
 * sans argument et obtient les implémentations réelles ; les tests fournissent
 * un générateur et un éditeur factices pour vérifier la mécanique elle-même.
 */
export interface ReviewWorkerDeps {
  repo?: Repo;
  generator?: ReplyGenerator;
  /** Ignoré si `resolvePublisher` est fourni. */
  publisher?: GooglePublisher;
  /**
   * Résout l'éditeur à partir du jeton déchiffré de la fiche. Par défaut,
   * déchiffre `googleAccessTokenEnc` puis construit un éditeur réel ; retombe
   * sur `notYetApprovedPublisher` si aucun jeton n'est enregistré — c'est le
   * cas de toutes les fiches tant que l'OAuth Google n'est pas branché.
   */
  resolvePublisher?: (accessTokenEnc: string | null) => Promise<GooglePublisher>;
}

async function defaultResolvePublisher(accessTokenEnc: string | null): Promise<GooglePublisher> {
  if (!accessTokenEnc) return notYetApprovedPublisher;
  const token = await decryptToken(accessTokenEnc);
  return createGooglePublisher(token);
}

/**
 * Traite un job : charge l'avis et son contexte, génère la réponse, la
 * publie, écrit le résultat. Exportée séparément du `Worker` BullMQ pour
 * pouvoir l'appeler directement dans un test, sans file ni Redis, quand seul
 * le comportement métier est en cause.
 */
export async function processReviewReplyJob(
  data: ReviewReplyJobData,
  deps: ReviewWorkerDeps = {},
): Promise<void> {
  const repo = deps.repo ?? getRepo();
  const generator = deps.generator ?? openAiReplyGenerator;
  const resolvePublisher = deps.resolvePublisher ?? defaultResolvePublisher;

  const review = await repo.getReviewById(data.reviewId);
  if (!review) throw new Error(`Avis introuvable : ${data.reviewId}`);

  // Revérifié à l'exécution, pas seulement à la mise en file : le réglage a
  // pu changer entre l'enqueue et le traitement (le job peut attendre en file
  // si le worker était arrêté), et publier malgré une désactivation entre-temps
  // romprait la promesse faite à l'artisan qui vient de désactiver l'option.
  if (review.status !== "pending") return;

  const profile = await repo.getProfileById(review.googleProfileId);
  if (!profile) throw new Error(`Fiche introuvable pour l'avis ${data.reviewId}`);
  if (!profile.aiAutoReply) return;

  const company = await repo.getCompanyForProfile(profile.id);
  if (!company) throw new Error(`Entreprise introuvable pour la fiche ${profile.id}`);

  // La proposition est rédigée dans TOUS les cas — y compris pour un avis
  // négatif : le travail utile de l'IA est justement d'épargner à l'artisan la
  // page blanche au moment où répondre est le plus difficile.
  try {
    const replyText = await generator.generateReply({
      reviewerName: review.reviewerName,
      rating: review.rating,
      comment: review.comment,
      tradeType: company.tradeType,
      city: profile.city,
      businessName: profile.businessName,
    });

    // Décision de publication : la note, et elle seule.
    if (!estAvisPositif(review.rating)) {
      await repo.saveReviewDraft(data.reviewId, replyText);
      return;
    }

    const publisher = deps.publisher ?? (await resolvePublisher(profile.googleAccessTokenEnc));
    await publisher.publishReviewReply(review.googleReviewId, replyText);

    // Écrit seulement après la publication effective : un avis marqué
    // « approved » doit signifier « publié sur Google », pas « nous avons
    // essayé ». Écrire avant, puis échouer sur la publication, laisserait un
    // avis affiché comme traité alors que rien n'est en ligne.
    await repo.saveReviewReply(data.reviewId, replyText);
  } catch (err) {
    await repo.markReviewFailed(data.reviewId);
    throw err; // BullMQ enregistre l'échec ; voir reviewQueue.ts sur `attempts: 1`.
  }
}

/** Démarre le worker BullMQ. Processus long, à exécuter séparément de l'app web. */
export function createReviewWorker(deps: ReviewWorkerDeps = {}): Worker<ReviewReplyJobData> {
  return new Worker<ReviewReplyJobData>(
    REVIEW_REPLY_QUEUE,
    async (job: Job<ReviewReplyJobData>) => processReviewReplyJob(job.data, deps),
    {
      connection: getRedisConnection(),
      // Trois avis en parallèle : assez pour ne pas laisser une file de fin de
      // journée s'accumuler, assez peu pour rester sous le quota de l'API
      // Google Business Profile (300 requêtes/minute, partagées entre tous
      // les clients — voir cahier des charges §10) même si plusieurs artisans
      // reçoivent des avis au même moment.
      concurrency: 3,
    },
  );
}
