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
import type { DonneesTableauDeBord } from "@/lib/server/tableauDeBord";
import AucuneFiche from "@/components/AucuneFiche";
import AgendaView from "@/components/AgendaView";
import { companyVariants, geoGrid, weekStats } from "@/lib/data";

/**
 * Valeurs de repli pour les écrans qui exigent une fiche.
 *
 * Elles ne s'affichent que si l'artisan ouvre Réglages ou Clients sans avoir
 * rattaché sa fiche. Volontairement neutres et vides : afficher un exemple
 * ferait croire à des données réelles.
 */
const PROFIL_VIDE = {
  business_name: "",
  city: "",
  keyword: "",
  ai_auto_reply: true,
  google_connected: false,
  best_rank: 0,
};

const QR_VIDE = { label: "", scans_count: 0, code_slug: "", place_id: null };

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

export default function TableauDeBord({ donnees }: { donnees: DonneesTableauDeBord }) {
  const activeCompany = donnees.company;
  const googleProfile = donnees.profile;
  const qrCode = donnees.qrCode;
  // Aucune source réelle pour l'instant : la détection de concurrents n'est
  // branchée sur rien. Une liste vide vaut mieux que des exemples inventés
  // présentés comme des signalements réels.
  const competitorFlags: never[] = [];
  const [view, setView] = useState<ViewId>("home");
  const [reviews, setReviews] = useState<Review[]>(donnees.reviews);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [aiAutoReply, setAiAutoReply] = useState(googleProfile?.ai_auto_reply ?? true);
  const [posts, setPosts] = useState<Post[]>(donnees.posts);
  const [regenEnCours, setRegenEnCours] = useState<string | null>(null);
  const [rendezVous, setRendezVous] = useState(donnees.rendezVous);

  // ?status=past_due | canceled | trialing — voir README. Sans paramètre, on
  // reste sur l'abonnement actif.
  /*
   * Simulation d'état d'abonnement, réservée au développement.
   *
   * Elle servait à montrer les écrans « impayé » et « résilié » sans toucher à
   * la base. Maintenant que l'écran affiche de VRAIES données, la laisser
   * active en production permettrait à un client de se voir résilié à tort et
   * d'écrire au support pour un état qu'il a lui-même déclenché.
   *
   * Elle ne donne aucun accès supplémentaire : les variantes ne font que
   * dégrader l'état affiché, jamais l'améliorer.
   */
  const parametreStatut = useQueryParam("status");
  const statusOverride =
    process.env.NODE_ENV === "production" ? null : parametreStatut;
  const [reactivated, setReactivated] = useState(false);
  const simulated: Company | undefined = statusOverride
    ? companyVariants[statusOverride]
    : undefined;
  const company = reactivated ? activeCompany : (simulated ?? activeCompany);

  const isBlocked = company.subscription_status === "canceled";
  const isPastDue = company.subscription_status === "past_due";

  const needsReviewCount = reviews.filter((r) => r.status === "needs_review").length;
  const rdvCount = rendezVous.filter((r) => r.status === "confirmed").length;

  /**
   * Marque un rendez-vous honoré ou annulé.
   *
   * L'état local est mis à jour APRÈS confirmation du serveur : l'inverse
   * ferait disparaître un rendez-vous de l'écran alors qu'il est toujours en
   * base, et l'artisan le retrouverait au rechargement suivant sans comprendre.
   */
  async function handleStatutRdv(id: string, statut: "honored" | "canceled") {
    if (!donnees.profileId) return;
    const reponse = await fetch("/api/rendez-vous", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ficheId: donnees.profileId, rendezVousId: id, statut }),
    });
    if (!reponse.ok) {
      window.alert("La mise à jour a échoué. Réessayez dans un instant.");
      return;
    }
    setRendezVous((prev) => prev.map((r) => (r.id === id ? { ...r, status: statut } : r)));
  }
  const openReview = reviews.find((r) => r.id === openReviewId) ?? null;

  function handlePublish(reviewId: string, text: string) {
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId ? { ...r, status: "published", reply_text: text } : r
      )
    );
    setOpenReviewId(null);
  }


  /**
   * Régénération réelle d'une publication.
   *
   * Ce bouton piochait auparavant dans deux textes écrits en dur qu'il faisait
   * tourner : l'artisan croyait voir une IA travailler. Il appelle désormais
   * /api/posts, qui vérifie le palier côté serveur et enregistre le résultat.
   */
  async function handleRegeneratePost(postId: string) {
    if (!donnees.profileId || regenEnCours) return;
    const post = posts.find((p) => p.id === postId);
    setRegenEnCours(postId);
    try {
      const reponse = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ficheId: donnees.profileId,
          sujet: post?.topic_tag ?? "conseil",
          postId,
        }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        // Le message du serveur est affiché tel quel : il explique le plafond
        // atteint ou le palier requis, ce qu'un « une erreur est survenue »
        // ne dirait pas.
        window.alert(data.error ?? "La régénération a échoué.");
        return;
      }
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, content: data.content } : p))
      );
    } catch {
      window.alert("La régénération a échoué. Réessayez dans un instant.");
    } finally {
      setRegenEnCours(null);
    }
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
          {donnees.sansFiche || !googleProfile ? (
            <AucuneFiche companyName={activeCompany.company_name} />
          ) : (
            <ViewGate skeleton={<HomeSkeleton />} what="votre visibilité">
              {/* geoGrid et weekStats restent des exemples : rank_trackings
                  n'est alimentée par rien tant que l'API Google n'est pas
                  accordée. Ils ne s'affichent QUE pour une fiche réellement
                  rattachée, donc jamais pour un compte neuf. */}
              <HomeView geoGrid={geoGrid} weekStats={weekStats} googleProfile={googleProfile} />
            </ViewGate>
          )}
        </main>
      )}
      {view === "agenda" && (
        <main>
          <ViewGate skeleton={<ListSkeleton label="Agenda" rows={3} />} what="votre agenda">
            <AgendaView rendezVous={rendezVous} onStatut={handleStatutRdv} />
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
            <ClientsView qrCode={qrCode ?? QR_VIDE} />
          </ViewGate>
        </main>
      )}
      {view === "settings" && (
        <main>
          <ViewGate skeleton={<SettingsSkeleton />} what="vos réglages">
            <SettingsView
              company={company}
              googleProfile={googleProfile ?? PROFIL_VIDE}
              aiAutoReply={aiAutoReply}
              onToggleAiAutoReply={setAiAutoReply}
              flags={competitorFlags}
            />
          </ViewGate>
        </main>
      )}

      <BottomNav
        active={view}
        onChange={setView}
        needsReviewCount={needsReviewCount}
        rdvCount={rdvCount}
      />

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
