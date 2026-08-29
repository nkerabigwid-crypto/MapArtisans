"use client";

import { useState } from "react";
import Link from "next/link";
import type { Company, GoogleProfile, CompetitorFlag } from "@/lib/data";
import { REASON_LABEL, formatPlanLabel } from "@/lib/data";

interface SettingsViewProps {
  company: Company;
  googleProfile: GoogleProfile;
  aiAutoReply: boolean;
  onToggleAiAutoReply: (value: boolean) => void;
  flags: CompetitorFlag[];
}

export default function SettingsView({
  company,
  googleProfile,
  aiAutoReply,
  onToggleAiAutoReply,
  flags,
}: SettingsViewProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <section className="view" aria-label="Réglages">
      <div className="section-label">Fiche Google</div>
      <div className="card">
        <div className="settings-row">
          <div>
            <div className="row-title">
              {googleProfile.google_connected ? "Connectée" : "Non connectée"}
            </div>
            <div className="row-sub">Connexion Google Business Profile</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="row-title">Réponse auto IA</div>
            <div className="row-sub">ai_auto_reply</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={aiAutoReply}
              onChange={(e) => onToggleAiAutoReply(e.target.checked)}
            />
            <span className="track" />
          </label>
        </div>
      </div>

      <div className="section-label">Abonnement</div>
      <div className="card">
        <div className="settings-row">
          <div>
            <div className="row-title">{formatPlanLabel(company)}</div>
            <div className="row-sub">
              {company.subscription_status === "active" ? "Actif" : company.subscription_status}
            </div>
          </div>
          <Link href="/abonnement" className="btn secondary">
            Gérer
          </Link>
        </div>
      </div>

      <div className="section-label">Avancé</div>
      <div className="card">
        <button
          className="advanced-toggle"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <div>
            <div className="row-title">Fiches concurrentes suspectes</div>
            <div className="row-sub">{flags.length} détectée{flags.length > 1 ? "s" : ""}</div>
          </div>
          <span aria-hidden="true">{advancedOpen ? "▴" : "▾"}</span>
        </button>
        {advancedOpen && (
          <div className="advanced-body">
            {flags.map((flag) => (
              <div key={flag.id} className="flag-item">
                <div className="flag-name">{flag.flagged_name}</div>
                <div className="flag-reason">{REASON_LABEL[flag.reason]}</div>
                <button
                  className="btn secondary"
                  style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}
                  disabled
                  title="Nécessite le compte de veille MapArtisans côté backend"
                >
                  Générer le signalement
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
