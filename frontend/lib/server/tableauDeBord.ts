// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import { getRepo } from "@/lib/server/repo";
import { resolveTradeOrDefault } from "@/lib/trades";
import { PLANS } from "@/lib/data";
import type {
  Company,
  GoogleProfile,
  Review,
  Post,
  QrCode,
  PlanId,
  Country,
} from "@/lib/data";

/**
 * Données réelles du tableau de bord.
 *
 * CE MODULE EXISTE PARCE QUE L'ÉCRAN MENTAIT
 *
 * Le tableau de bord affichait « Dupont Plomberie, Lyon », ses avis, sa
 * Geo-Grid et ses publications — pour TOUT LE MONDE. Un artisan qui venait de
 * s'inscrire voyait l'activité d'une entreprise fictive française à la place de
 * la sienne, et pouvait légitimement croire que son compte était mélangé avec
 * celui d'un autre.
 *
 * L'ÉTAT VIDE EST LE CAS NORMAL, PAS UNE ERREUR
 *
 * Tant que l'accès à l'API Google n'est pas accordé, aucun artisan n'a de fiche
 * rattachée : ni avis, ni position, ni publication. Cet écran doit donc être
 * juste et lisible avec zéro donnée — c'est l'état dans lequel se trouveront
 * tous les premiers clients, et le seul qu'ils verront au moment de décider
 * s'ils gardent l'abonnement.
 */

export interface RendezVousAffiche {
  id: string;
  clientName: string;
  clientPhone: string;
  requestedAt: string;
  details: string | null;
  status: "confirmed" | "honored" | "canceled";
}

export interface DonneesTableauDeBord {
  company: Company;
  /** Identifiant interne de la fiche, requis par les routes API. `null` sans fiche. */
  profileId: string | null;
  profile: GoogleProfile | null;
  reviews: Review[];
  posts: Post[];
  qrCode: QrCode | null;
  rendezVous: RendezVousAffiche[];
  /** `true` tant qu'aucune fiche Google n'est rattachée. */
  sansFiche: boolean;
}

function versDateIso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function chargerTableauDeBord(
  userId: string,
): Promise<DonneesTableauDeBord | null> {
  const repo = getRepo();

  const entreprise = await repo.findCompanyForUser(userId);
  // Un utilisateur sans entreprise ne devrait pas exister : l'inscription crée
  // les deux. Le cas signale une donnée incohérente, pas un état d'attente —
  // on le remonte plutôt que d'inventer une entreprise vide.
  if (!entreprise) return null;

  const plan = PLANS.find((p) => p.id === entreprise.planId);

  const company: Company = {
    id: entreprise.id,
    company_name: entreprise.companyName,
    trade_type: entreprise.tradeType,
    country: entreprise.country as Country,
    currency: "CHF",
    plan_id: entreprise.planId as PlanId,
    subscription_status: entreprise.subscriptionStatus,
    // Le montant vient de la COLONNE, pas du catalogue : un client garde le
    // tarif auquel il a souscrit même si la grille change ensuite.
    plan_amount: entreprise.planAmount || plan?.amount || 0,
    payment_failed_at: versDateIso(entreprise.paymentFailedAt),
    grace_period_ends_at: versDateIso(entreprise.gracePeriodEndsAt),
    canceled_at: versDateIso(entreprise.canceledAt),
  };

  const fiches = await repo.listProfilesForUser(userId);
  const fiche = fiches[0] ?? null;

  if (!fiche) {
    return {
      company,
      profileId: null,
      profile: null,
      reviews: [],
      posts: [],
      qrCode: null,
      rendezVous: [],
      sansFiche: true,
    };
  }

  const [avis, publications, rdv] = await Promise.all([
    repo.listReviewsForProfile(fiche.id),
    repo.listerPosts(fiche.id),
    repo.listerRendezVous(fiche.id),
  ]);

  const profile: GoogleProfile = {
    business_name: fiche.businessName,
    city: fiche.city,
    // Le mot-clé suivi viendra de rank_trackings quand la Geo-Grid tournera.
    // En attendant, on compose le plus probable plutôt que d'afficher un vide.
    keyword: `${resolveTradeOrDefault(entreprise.tradeType).court} ${fiche.city}`.trim(),
    ai_auto_reply: fiche.aiAutoReply,
    google_connected: Boolean(fiche.googleAccessTokenEnc),
    best_rank: fiche.bestPosition ?? 0,
  };

  return {
    company,
    profileId: fiche.id,
    profile,
    reviews: avis.map(
      (r): Review => ({
        id: r.id,
        reviewer_name: r.reviewerName ?? "Client Google",
        rating: r.rating,
        comment: r.comment ?? "",
        // `pending` côté base signifie « réponse à valider » côté écran.
        status: r.status === "approved" ? "published" : "needs_review",
        ai_reply_draft: r.aiReplyDraft ?? "",
        reply_text: r.replyText,
        review_date: "",
      }),
    ),
    posts: publications.map(
      (p): Post => ({
        id: p.id,
        content: p.content,
        topic_tag: p.topicTag ?? "generique",
        status: p.status,
        scheduled_at: p.scheduledAt.toISOString().slice(0, 10),
      }),
    ),
    rendezVous: rdv.map((r) => ({
      id: r.id,
      clientName: r.clientName,
      clientPhone: r.clientPhone,
      // Sérialisé en ISO : une Date ne traverse pas la frontière serveur/client
      // sans être transformée, et un format localisé côté serveur figerait la
      // langue du navigateur de l'artisan.
      requestedAt: r.requestedAt.toISOString(),
      details: r.details,
      status: r.status,
    })),
    qrCode: fiche.placeId
      ? {
          label: "Votre QR code",
          scans_count: 0,
          code_slug: fiche.id,
          place_id: fiche.placeId,
        }
      : null,
    sansFiche: false,
  };
}
