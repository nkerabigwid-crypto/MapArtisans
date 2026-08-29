"use client";

import { useState } from "react";
import Link from "next/link";
import { Accordion } from "@base-ui/react/accordion";
import { company as activeCompany, companyVariants, PLANS, type PlanId } from "@/lib/data";
import { useQueryParam } from "@/lib/useQueryParam";

/**
 * Écran d'abonnement.
 *
 * Trois paliers — Essentiel, Pro, Agence — tous facturés en francs suisses,
 * quel que soit le pays du client : l'éditeur est suisse et facture dans sa
 * devise. Les montants vivent dans PLANS (lib/data.ts) et restent à valider
 * commercialement ; aucune contrainte de coût ne les impose.
 *
 * AUCUN champ de carte n'est rendu ici, et il ne devra jamais y en avoir : le
 * paiement passe par Stripe Checkout, qui héberge le formulaire sur son propre
 * domaine. Les données de carte ne transitent ainsi jamais par MapArtisans, ce
 * qui sort l'application du périmètre PCI-DSS le plus lourd.
 */

const FAQ = [
  {
    q: "Pourquoi une facturation en francs suisses ?",
    a: "MapArtisans est édité en Suisse et facture dans sa devise, quel que soit votre pays. Si vous payez avec une carte en euros, votre banque applique son taux de change du jour — le montant prélevé peut donc varier légèrement d'un mois à l'autre.",
  },
  {
    q: "Puis-je résilier quand je veux ?",
    a: "Oui, depuis vos réglages, en un clic. L'abonnement reste actif jusqu'à la fin du mois déjà payé, sans frais de sortie.",
  },
  {
    q: "Que devient ma fiche si j'arrête ?",
    a: "Elle reste la vôtre. MapArtisans cesse d'y publier, mais rien n'est supprimé : vos avis et vos posts déjà en ligne restent en place.",
  },
  {
    q: "Y a-t-il un engagement ?",
    a: "Aucun. La facturation est mensuelle et s'arrête le mois où vous résiliez.",
  },
];

export default function SubscriptionPage() {
  const statusOverride = useQueryParam("status");
  const company = statusOverride
    ? (companyVariants[statusOverride] ?? activeCompany)
    : activeCompany;

  const [redirecting, setRedirecting] = useState<PlanId | null>(null);

  function handleSubscribe(planId: PlanId) {
    setRedirecting(planId);
    // À remplacer par la création d'une session Stripe Checkout côté serveur,
    // puis window.location.assign(session.url). Le retour se fait sur
    // /abonnement/succes, et c'est le webhook Stripe — pas cette redirection —
    // qui fait foi pour passer subscription_status à 'active'.
  }

  return (
    <div className="app ob-app">
      <main className="ob-main">
        <h1 className="ob-title">Votre abonnement</h1>
        <p className="ob-lede">
          Deux formules, sans engagement. Tarifs en francs suisses, quel que soit votre pays.
        </p>

        <div className="plans">
          {PLANS.map((plan) => {
            const current = plan.id === company.plan_id;
            return (
              <div
                key={plan.id}
                className={`card plan-card${plan.recommended ? " featured" : ""}`}
              >
                {plan.recommended && <div className="plan-flag">Le plus choisi</div>}
                {current && <div className="plan-current">Votre formule actuelle</div>}

                <div className="plan-name">{plan.name}</div>
                <div className="plan-price">
                  {plan.amount} <span className="plan-cur">CHF</span>
                  <span className="plan-per"> / mois</span>
                </div>
                <p className="plan-audience">{plan.audience}</p>

                {plan.highlight && <div className="plan-highlight">{plan.highlight}</div>}

                <ul className="plan-list">
                  {plan.features.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                <button
                  className={`btn plan-cta${plan.recommended ? "" : " secondary"}`}
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={redirecting !== null || current}
                >
                  {current
                    ? "Formule actuelle"
                    : redirecting === plan.id
                      ? "Redirection vers Stripe…"
                      : `Choisir ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <p className="plan-secure">
          Le paiement est traité par Stripe. Vos coordonnées bancaires ne passent jamais par
          MapArtisans.
        </p>

        {redirecting && (
          <div className="card plan-mock" role="status">
            <b>Prototype</b> — la redirection s&apos;arrête ici : aucune session Stripe n&apos;est
            créée tant que les clés et les routes serveur n&apos;existent pas.
          </div>
        )}

        <h2 className="plan-faq-title">Questions fréquentes</h2>
        <Accordion.Root className="faq">
          {FAQ.map(({ q, a }) => (
            <Accordion.Item key={q} className="faq-item">
              <Accordion.Header>
                <Accordion.Trigger className="faq-trigger">
                  <span>{q}</span>
                  <span className="faq-mark" aria-hidden="true">
                    ＋
                  </span>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel className="faq-panel">
                <div className="faq-body">{a}</div>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion.Root>

        <Link href="/tableau-de-bord" className="plan-back">
          Retour au tableau de bord
        </Link>
      </main>
    </div>
  );
}
