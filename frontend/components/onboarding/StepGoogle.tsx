"use client";

import { useState } from "react";

interface StepGoogleProps {
  companyName: string;
  onConnected: () => void;
  onBack: () => void;
}

// Chaque ligne correspond à un scope réellement demandé à l'API Google Business
// Profile. Les énumérer avant le consentement, plutôt qu'après, est ce qui
// distingue une demande d'accès honnête d'un bouton opaque.
const GRANTS = [
  "lire les avis déposés sur votre fiche",
  "y publier les réponses que vous validez",
  "publier les posts que vous approuvez",
  "lire vos statistiques : appels, itinéraires, position",
];

const NOT_GRANTED = [
  "vos e-mails, contacts ou agenda",
  "vos moyens de paiement",
  "toute modification de vos horaires ou coordonnées",
];

export default function StepGoogle({ companyName, onConnected, onBack }: StepGoogleProps) {
  const [connecting, setConnecting] = useState(false);

  function handleConnect() {
    setConnecting(true);
    // Simule l'aller-retour OAuth. À remplacer par la redirection réelle vers
    // le consentement Google, qui reviendra sur /api/google/callback.
    setTimeout(onConnected, 1200);
  }

  return (
    <div className="ob-form">
      <h1 className="ob-title">Connecter votre fiche Google</h1>
      <p className="ob-lede">
        Dernière étape. Sans cet accès, MapArtisans ne peut ni lire vos avis ni publier à votre
        place pour {companyName}.
      </p>

      <div className="card grants">
        <div className="grants-title">MapArtisans pourra</div>
        <ul className="grants-list yes">
          {GRANTS.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <div className="grants-title">MapArtisans n&apos;aura jamais accès à</div>
        <ul className="grants-list no">
          {NOT_GRANTED.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>

      <p className="grants-note">
        Vous pouvez révoquer cet accès à tout moment depuis votre compte Google ou depuis les
        réglages de MapArtisans.
      </p>

      <div className="ob-actions">
        <button type="button" className="btn secondary" onClick={onBack} disabled={connecting}>
          Retour
        </button>
        <button type="button" className="btn" onClick={handleConnect} disabled={connecting}>
          {connecting ? "Connexion…" : "Connecter Google"}
        </button>
      </div>
    </div>
  );
}
