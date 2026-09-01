"use client";

import { useState } from "react";
import Link from "next/link";
import OnboardingStepper from "@/components/onboarding/OnboardingStepper";
import StepBusiness, { type BusinessDraft } from "@/components/onboarding/StepBusiness";
import StepContact, { type ContactDraft } from "@/components/onboarding/StepContact";
import StepGoogle from "@/components/onboarding/StepGoogle";
import EntetePublic from "@/components/EntetePublic";

const STEPS = ["Entreprise", "Contact", "Google"];

/**
 * Parcours d'inscription.
 *
 * Une étape par écran : sur un téléphone, un formulaire unique de huit champs
 * décourage plus qu'il n'informe. L'ordre suit une dépendance réelle — on ne
 * peut pas demander l'accès à une fiche Google avant de savoir quelle
 * entreprise on cherche.
 *
 * Le compte est créé à la fin de l'étape « Contact », par /api/auth/register.
 * L'étape Google reste en attente : l'accès à l'API Business Profile n'est pas
 * encore accordé. L'artisan atteint donc son tableau de bord sans avoir
 * connecté sa fiche — mieux vaut un compte utilisable qu'un parcours bloqué
 * sur une étape dont la date d'ouverture ne dépend pas de nous.
 */
export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [business, setBusiness] = useState<BusinessDraft>({
    company_name: "",
    trade_type: null,
    country: "CH",
  });
  const [contact, setContact] = useState<ContactDraft>({
    email: "",
    phone_number: "",
    password: "",
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  /**
   * Crée le compte, puis passe à l'étape Google.
   *
   * La session est ouverte par la route elle-même (cookie httpOnly) : l'artisan
   * est donc connecté dès la sortie de cette fonction, et peut atteindre son
   * tableau de bord même s'il abandonne l'étape suivante.
   */
  async function creerLeCompte() {
    setErreur(null);
    setEnvoi(true);
    try {
      const reponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: contact.email,
          password: contact.password,
          phoneNumber: contact.phone_number,
          companyName: business.company_name,
          tradeType: business.trade_type,
          country: business.country,
        }),
      });
      if (reponse.ok) {
        setStep(2);
        return;
      }
      const donnees = await reponse.json().catch(() => ({}));
      // Le message du serveur est repris tel quel : il dit précisément ce qui
      // bloque (adresse déjà prise, mot de passe trop court), là où un message
      // générique obligerait l'artisan à deviner.
      setErreur(donnees.error ?? "La création du compte a échoué. Réessayez.");
    } catch {
      setErreur("Connexion impossible. Vérifiez votre réseau et réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  if (done) {
    return (
      <div className="app ob-app">
        <main className="ob-main">
          <div className="card ob-done">
            <div className="ob-done-mark" aria-hidden="true">
              ✓
            </div>
            <h1 className="ob-title">Fiche connectée</h1>
            <p className="ob-lede">
              Le premier relevé de position est lancé. Vos résultats apparaissent sous 48 heures —
              vous recevrez un SMS dès qu&apos;ils sont prêts.
            </p>
            <Link href="/tableau-de-bord" className="btn ob-next">
              Ouvrir le tableau de bord
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      {/* L'en-tête est HORS de la colonne de 460 px : c'est une barre de site,
          elle traverse l'écran. Dedans, elle héritait de la largeur du
          formulaire et son contenu débordait du fond blanc.

          Le lien « Connexion » remplace l'ancien « J'ai déjà un compte » : un
          client déjà inscrit qui clique sur « Essai gratuit » par habitude y
          retrouve sa page de connexion. */}
      <EntetePublic />
      <div className="app ob-app">
        <OnboardingStepper current={step} labels={STEPS} />
      <main className="ob-main">
        {step === 0 && (
          <StepBusiness
            draft={business}
            onChange={(patch) => setBusiness((prev) => ({ ...prev, ...patch }))}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <StepContact
            draft={contact}
            onChange={(patch) => setContact((prev) => ({ ...prev, ...patch }))}
            onNext={creerLeCompte}
            onBack={() => setStep(0)}
            erreur={erreur}
            envoi={envoi}
          />
        )}
        {step === 2 && (
          <StepGoogle
            companyName={business.company_name || "votre entreprise"}
            onConnected={() => setDone(true)}
            onBack={() => setStep(1)}
          />
        )}
        </main>
      </div>
    </>
  );
}
