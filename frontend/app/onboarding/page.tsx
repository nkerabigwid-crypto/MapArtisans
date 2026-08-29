"use client";

import { useState } from "react";
import Link from "next/link";
import OnboardingStepper from "@/components/onboarding/OnboardingStepper";
import StepBusiness, { type BusinessDraft } from "@/components/onboarding/StepBusiness";
import StepContact, { type ContactDraft } from "@/components/onboarding/StepContact";
import StepGoogle from "@/components/onboarding/StepGoogle";

const STEPS = ["Entreprise", "Contact", "Google"];

/**
 * Parcours d'inscription.
 *
 * Une étape par écran : sur un téléphone, un formulaire unique de huit champs
 * décourage plus qu'il n'informe. L'ordre suit une dépendance réelle — on ne
 * peut pas demander l'accès à une fiche Google avant de savoir quelle
 * entreprise on cherche.
 *
 * Aucun compte n'est créé : le brouillon reste en mémoire jusqu'à ce que les
 * routes d'inscription et l'OAuth Google existent côté backend.
 */
export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [business, setBusiness] = useState<BusinessDraft>({
    company_name: "",
    trade_type: null,
    country: "CH",
  });
  const [contact, setContact] = useState<ContactDraft>({ email: "", phone_number: "" });

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
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
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
  );
}
