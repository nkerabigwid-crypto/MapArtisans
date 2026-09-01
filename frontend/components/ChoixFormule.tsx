"use client";

import { useState } from "react";
import Link from "next/link";
import { Accordion } from "@base-ui/react/accordion";
import { PLANS, type PlanId } from "@/lib/data";

/**
 * Questions posées au moment de payer.
 *
 * Elles répondent aux trois hésitations réelles — la devise, la sortie, ce que
 * devient la fiche — et non à des questions inventées pour remplir la page.
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

interface ChoixFormuleProps {
  planActuel: PlanId;
  statut: "incomplete" | "trialing" | "active" | "past_due" | "canceled";
  /** `false` tant que Stripe n'est pas configuré. */
  paiementOuvert: boolean;
}

/**
 * Choix de la formule et départ vers Stripe.
 *
 * DEUX DÉFAUTS CORRIGÉS ICI
 *
 * 1. Le bouton ne faisait RIEN. `handleSubscribe` était un talon avec un
 *    commentaire « à remplacer » : il affichait « Redirection vers Stripe… »
 *    et s'arrêtait là. La route /api/paiement/checkout existait pourtant,
 *    testée, et n'était appelée par personne.
 *
 * 2. « Formule actuelle » s'affichait pendant l'ESSAI. `plan_id` vaut
 *    « basique » dès l'inscription — c'est le tarif de référence, pas une
 *    souscription. Un client en essai voyait donc sa formule d'entrée grisée
 *    comme s'il l'avait déjà achetée, et ne pouvait plus la choisir.
 */

/** Un palier n'est « le vôtre » que si un paiement le porte. */
function estSouscrit(statut: ChoixFormuleProps["statut"]): boolean {
  return statut === "active" || statut === "past_due";
}

export default function ChoixFormule({
  planActuel,
  statut,
  paiementOuvert,
}: ChoixFormuleProps) {
  const [enCours, setEnCours] = useState<PlanId | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const souscrit = estSouscrit(statut);

  /**
   * Lien de secours quand le règlement en ligne n'est pas encore ouvert.
   *
   * Un bouton grisé laisse le client sans issue. Celui-ci ouvre un message
   * pré-rempli : il peut souscrire tout de suite, par un autre canal, et
   * l'exploitant sait exactement quelle formule est demandée.
   */
  function lienDeSecours(plan: (typeof PLANS)[number]): string {
    const sujet = encodeURIComponent(`Souscription formule ${plan.name}`);
    const corps = encodeURIComponent(
      `Bonjour,\n\nJe souhaite souscrire la formule ${plan.name} ` +
        `(${plan.amount} CHF par mois).\n\nMerci de me faire parvenir la marche à suivre.\n`,
    );
    return `mailto:contact@mapartisans.com?subject=${sujet}&body=${corps}`;
  }

  async function choisir(planId: PlanId) {
    setErreur(null);
    setEnCours(planId);
    try {
      const reponse = await fetch("/api/paiement/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await reponse.json().catch(() => ({}));
      if (!reponse.ok || !data.url) {
        // Le message du serveur est affiché tel quel : il nomme la cause.
        setErreur(data.error ?? "Le paiement n'a pas pu démarrer. Réessayez.");
        setEnCours(null);
        return;
      }
      // `assign` et non `replace` : le retour arrière doit ramener ici si le
      // client renonce sur la page Stripe.
      window.location.assign(data.url);
    } catch {
      setErreur("Le paiement n'a pas pu démarrer. Vérifiez votre connexion.");
      setEnCours(null);
    }
  }

  return (
    <div className="app ob-app">
      <main className="ob-main">
        <h1 className="ob-title">Votre abonnement</h1>
        <p className="ob-lede">
          Trois formules, sans engagement. Tarifs en francs suisses, quel que soit
          votre pays.
        </p>

        {statut === "trialing" && (
          <p className="ob-lede">
            Vous êtes en période d&apos;essai. Choisir une formule maintenant ne
            l&apos;interrompt pas : le premier prélèvement a lieu à la fin de
            l&apos;essai.
          </p>
        )}

        {!paiementOuvert && (
          /*
           * Le règlement en ligne n'est pas encore ouvert — mais on ne grise
           * PLUS les boutons pour autant. Un bouton grisé laisse le client sans
           * issue ; celui-ci ouvre un message pré-rempli, et la souscription
           * reste possible. On explique simplement ce qui va se passer.
           */
          <div className="vide-attente" role="status">
            <p className="vide-attente-titre">Souscription par message</p>
            <p className="vide-attente-texte">
              Le règlement par carte s&apos;ouvre dans quelques jours. D&apos;ici
              là, votre demande nous parvient par e-mail et nous vous rappelons —
              votre période d&apos;essai continue normalement.
            </p>
          </div>
        )}

        {erreur && (
          <div className="card error-state" role="alert">
            {erreur}
          </div>
        )}

        <div className="plans">
          {PLANS.map((plan) => {
            // « Votre formule » suppose un paiement : pendant l'essai, aucune
            // formule n'est encore la sienne.
            const actuelle = souscrit && plan.id === planActuel;
            return (
              <div
                key={plan.id}
                className={`card plan-card${plan.recommended ? " featured" : ""}`}
              >
                {actuelle && <div className="plan-current">Votre formule actuelle</div>}
                {!actuelle && plan.recommended && (
                  <div className="plan-badge">Le plus choisi</div>
                )}

                <h2 className="plan-name">{plan.name}</h2>
                {/* Classes d'origine : `plan-cur` et `plan-per`. Les avoir
                    renommées faisait perdre tout le style — le prix s'affichait
                    « 49CHF/ mois », collé et sans hiérarchie. */}
                <div className="plan-price">
                  {plan.amount} <span className="plan-cur">CHF</span>
                  <span className="plan-per"> / mois</span>
                </div>
                <p className="plan-audience">{plan.audience}</p>
                {plan.highlight && <p className="plan-highlight">{plan.highlight}</p>}

                <ul className="plan-list">
                  {plan.features.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                {/* UN SEUL LIBELLÉ POUR LES TROIS.
                    « Choisir Basique », « Choisir Essentiel »… obligeait à
                    relire le nom déjà écrit deux fois au-dessus. Un appel à
                    l'action identique se compare d'un coup d'œil : seuls le
                    prix et le contenu distinguent les cartes. */}
                {actuelle ? (
                  <button className="btn plan-cta secondary" disabled>
                    Formule actuelle
                  </button>
                ) : paiementOuvert ? (
                  <button
                    className={`btn plan-cta${plan.recommended ? "" : " secondary"}`}
                    onClick={() => void choisir(plan.id)}
                    disabled={enCours !== null}
                  >
                    {enCours === plan.id ? "Redirection vers Stripe…" : "Souscrire"}
                  </button>
                ) : (
                  <a
                    className={`btn plan-cta${plan.recommended ? "" : " secondary"}`}
                    href={lienDeSecours(plan)}
                  >
                    Souscrire
                  </a>
                )}
              </div>
            );
          })}
        </div>

        <p className="plan-secure">
          Le paiement est traité par Stripe. Vos coordonnées bancaires ne passent
          jamais par MapArtisans.
        </p>

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

        {/* SORTIE DE PAGE.
            Un lien souligné en petit, au bout d'une longue page de tarifs, se
            confond avec le pied de page. C'est pourtant la seule issue pour
            quelqu'un qui vient regarder les formules et repart sans acheter —
            la majorité des visites. Une cible pleine largeur, avec une flèche,
            se voit après trois écrans de défilement. */}
        <Link href="/tableau-de-bord" className="plan-back">
          <span className="plan-back-fleche" aria-hidden="true">
            ←
          </span>
          Retour au tableau de bord
        </Link>
      </main>
    </div>
  );
}
