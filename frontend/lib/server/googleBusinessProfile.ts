// PAS de `import "server-only"` ici, volontairement : ce module est aussi
// importé par workers/reviewWorker.ts, qui tourne comme un processus Node
// autonome, hors du bundler de Next. Le paquet `server-only` lève de façon
// INCONDITIONNELLE dès qu'il est chargé ailleurs que sous le bundler de Next
// (c'est ce dernier, et lui seul, qui sait le neutraliser) — l'ajouter ici
// ferait planter le worker au démarrage. La frontière réelle est déjà tenue
// autrement : rien sous lib/server/ n'est importé par un composant "use
// client" (vérifié), et chaque route Next qui l'utilise déclare elle-même
// `export const runtime = "nodejs"`.
import { RetryableError, withBackoff } from "@/lib/server/resilience";

/**
 * Publication sur Google Business Profile — interface, pas encore
 * d'implémentation réelle.
 *
 * L'accès à cette API est soumis à approbation Google : fiche vérifiée depuis
 * plus de 60 jours, puis 14 jours d'examen de la demande (voir le document
 * « Accès API Google Business Profile »). Tant que l'approbation n'est pas
 * obtenue, aucun appel réel n'est possible — pas même pour un test manuel.
 *
 * `NotYetApprovedPublisher` fait volontairement échouer tout appel, avec un
 * message qui dit pourquoi. C'est délibérément différent d'un stub qui
 * renverrait un faux succès : un faux succès masquerait, dans les journaux de
 * production, le jour où l'accès est enfin accordé mais où le vrai
 * `GooglePublisher` n'a pas encore été branché à sa place.
 */

export interface GooglePublisher {
  publishReviewReply(googleReviewId: string, replyText: string): Promise<void>;
}

export const notYetApprovedPublisher: GooglePublisher = {
  async publishReviewReply() {
    throw new Error(
      "GOOGLE_BUSINESS_PROFILE_NOT_APPROVED — l'accès à l'API Google Business " +
        "Profile n'est pas encore accordé pour ce projet. Voir le document " +
        "« Accès API Google Business Profile » pour la procédure de demande.",
    );
  },
};

/**
 * Implémentation réelle, prête à recevoir l'accès token par token.
 *
 * `accessToken` doit être le jeton déjà déchiffré (voir lib/server/crypto.ts) —
 * cette fonction ne lit jamais la base et ne connaît pas le format de
 * stockage : c'est au worker appelant de déchiffrer avant de l'invoquer.
 */
export function createGooglePublisher(accessToken: string): GooglePublisher {
  return {
    async publishReviewReply(googleReviewId, replyText) {
      await withBackoff(async () => {
        const response = await fetch(
          `https://mybusiness.googleapis.com/v4/${googleReviewId}/reply`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ comment: replyText }),
          },
        );

        if (response.ok) return;

        if ([429, 502, 503, 504].includes(response.status)) {
          const retryAfter = response.headers.get("retry-after");
          throw new RetryableError(
            `Google a répondu ${response.status}`,
            response.status,
            retryAfter ? Number(retryAfter) * 1000 : undefined,
          );
        }

        const body = await response.text().catch(() => "");
        throw new Error(`Échec définitif de publication (${response.status}) : ${body.slice(0, 300)}`);
      });
    },
  };
}
