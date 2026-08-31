"use client";

import { Suspense, useState } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import HomeView from "@/components/HomeView";
import ReviewsView from "@/components/ReviewsView";
import ReviewModal from "@/components/ReviewModal";
import PostsView from "@/components/PostsView";
import ClientsView from "@/components/ClientsView";
import SettingsView from "@/components/SettingsView";
import ViewGate from "@/components/ViewGate";
import {
  HomeSkeleton,
  ListSkeleton,
  ClientsSkeleton,
  SettingsSkeleton,
} from "@/components/Skeleton";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import BandeauGoogle from "@/components/BandeauGoogle";
import SubscriptionBlocked from "@/components/SubscriptionBlocked";
import { useQueryParam } from "@/lib/useQueryParam";
import type { ViewId } from "@/components/types";
import type { Review, Post, Company } from "@/lib/data";
import {
  company as activeCompany,
  companyVariants,
  googleProfile,
  geoGrid,
  weekStats,
  initialReviews,
  posts as initialPosts,
  qrCode,
  competitorFlags,
} from "@/lib/data";

const REGENERATED_DRAFTS = [
  "Chaudière en panne juste avant le week-end ? Dupont Plomberie intervient le jour même sur Lyon.",
  "Un doute sur une fuite ? Un diagnostic rapide évite souvent une réparation bien plus lourde.",
];

const SUB_LABEL: Record<string, string> = {
  active: "Abonnement actif",
  trialing: "Période d'essai",
  past_due: "Paiement en retard",
  canceled: "Abonnement résilié",
};

const SUB_TONE: Record<string, "good" | "warn" | "bad"> = {
  active: "good",
  trialing: "good",
  past_due: "warn",
  canceled: "bad",
};

export default function Page() {
  const [view, setView] = useState<ViewId>("home");
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [aiAutoReply, setAiAutoReply] = useState(googleProfile.ai_auto_reply);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [regenCount, setRegenCount] = useState(0);

  // ?status=past_due | canceled | trialing — voir README. Sans paramètre, on
  // reste sur l'abonnement actif.
  const statusOverride = useQueryParam("status");
  const [reactivated, setReactivated] = useState(false);
  const simulated: Company | undefined = statusOverride
    ? companyVariants[statusOverride]
    : undefined;
  const company = reactivated ? activeCompany : (simulated ?? activeCompany);

  const isBlocked = company.subscription_status === "canceled";
  const isPastDue = company.subscription_status === "past_due";

  const needsReviewCount = reviews.filter((r) => r.status === "needs_review").length;
  const openReview = reviews.find((r) => r.id === openReviewId) ?? null;

  function handlePublish(reviewId: string, text: string) {
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId ? { ...r, status: "published", reply_text: text } : r
      )
    );
    setOpenReviewId(null);
  }


  function handleRegeneratePost(postId: string) {
    const nextDraft = REGENERATED_DRAFTS[regenCount % REGENERATED_DRAFTS.length];
    setRegenCount((n) => n + 1);
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, content: nextDraft } : p))
    );
  }

  return (
    <div className="app">
      <TopBar
        companyName={company.company_name}
        subLabel={SUB_LABEL[company.subscription_status] ?? company.subscription_status}
        subTone={SUB_TONE[company.subscription_status] ?? "good"}
        onOpenSettings={() => setView("settings")}
      />

      <Suspense fallback={null}>
        <BandeauGoogle />
      </Suspense>

      {isPastDue && (
        <SubscriptionBanner company={company} onFixPayment={() => setView("settings")} />
      )}

      {/* Abonnement résilié : le service a cessé, afficher un dashboard vivant
          serait mensonger. On remplace tout le contenu et on retire la nav —
          naviguer entre des écrans inertes n'a pas de sens. */}
      {isBlocked ? (
        <main>
          <SubscriptionBlocked company={company} onReactivate={() => setReactivated(true)} />
        </main>
      ) : (
        <>
      {view === "home" && (
        <main>
          <ViewGate skeleton={<HomeSkeleton />} what="votre visibilité">
            <HomeView geoGrid={geoGrid} weekStats={weekStats} googleProfile={googleProfile} />
          </ViewGate>
        </main>
      )}
      {view === "reviews" && (
        <main>
          <ViewGate skeleton={<ListSkeleton label="Avis" />} what="vos avis">
            <ReviewsView reviews={reviews} onOpenReview={(r) => setOpenReviewId(r.id)} />
          </ViewGate>
        </main>
      )}
      {view === "posts" && (
        <main>
          <ViewGate skeleton={<ListSkeleton label="Posts" rows={3} />} what="vos posts">
            <PostsView posts={posts} onRegenerate={handleRegeneratePost} />
          </ViewGate>
        </main>
      )}
      {view === "clients" && (
        <main>
          <ViewGate skeleton={<ClientsSkeleton />} what="vos retours clients">
            <ClientsView qrCode={qrCode} />
          </ViewGate>
        </main>
      )}
      {view === "settings" && (
        <main>
          <ViewGate skeleton={<SettingsSkeleton />} what="vos réglages">
            <SettingsView
              company={company}
              googleProfile={googleProfile}
              aiAutoReply={aiAutoReply}
              onToggleAiAutoReply={setAiAutoReply}
              flags={competitorFlags}
            />
          </ViewGate>
        </main>
      )}

      <BottomNav active={view} onChange={setView} needsReviewCount={needsReviewCount} />

      {/* Toujours monté : Drawer a besoin de rester dans l'arbre pour jouer
          l'animation de sortie et le glissement de fermeture. */}
      <ReviewModal
        review={openReview}
        onClose={() => setOpenReviewId(null)}
        onPublish={handlePublish}
      />
        </>
      )}
    </div>
  );
}
