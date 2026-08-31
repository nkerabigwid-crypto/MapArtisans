"use client";

import { useState } from "react";

export interface RendezVous {
  id: string;
  clientName: string;
  clientPhone: string;
  requestedAt: string;
  details: string | null;
  status: "confirmed" | "honored" | "canceled";
}

interface AgendaViewProps {
  rendezVous: RendezVous[];
  onStatut: (id: string, statut: "honored" | "canceled") => Promise<void>;
}

/**
 * Agenda de l'artisan.
 *
 * CE QUE CET ÉCRAN REMPLACE
 *
 * Les rendez-vous étaient enregistrés en base et jamais relus. L'artisan
 * recevait un SMS et, s'il le perdait, le rendez-vous était perdu avec — soit
 * exactement le bout de papier que l'assistant devait faire disparaître.
 *
 * L'ordre est chronologique et le prochain est en tête : sur un téléphone
 * consulté entre deux interventions, la seule question est « c'est quoi la
 * suite ». Un tri par date de création aurait demandé de chercher.
 */

function quand(iso: string): { jour: string; heure: string; passe: boolean } {
  const d = new Date(iso);
  return {
    jour: d.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" }),
    heure: d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" }),
    passe: d.getTime() < Date.now(),
  };
}

export default function AgendaView({ rendezVous, onStatut }: AgendaViewProps) {
  const [enCours, setEnCours] = useState<string | null>(null);

  const aVenir = rendezVous.filter((r) => r.status === "confirmed");
  const traites = rendezVous.filter((r) => r.status !== "confirmed");

  async function agir(id: string, statut: "honored" | "canceled") {
    setEnCours(id);
    try {
      await onStatut(id, statut);
    } finally {
      setEnCours(null);
    }
  }

  if (rendezVous.length === 0) {
    return (
      <div className="agenda">
        <h2 className="agenda-titre">Agenda</h2>
        <p className="agenda-vide">
          Aucun rendez-vous pour l&apos;instant. Ceux que votre assistant prend sur
          votre site apparaîtront ici, et vous serez prévenu par SMS.
        </p>
      </div>
    );
  }

  return (
    <div className="agenda">
      <h2 className="agenda-titre">Agenda</h2>

      {aVenir.length === 0 ? (
        <p className="agenda-vide">Aucun rendez-vous à venir.</p>
      ) : (
        <ul className="agenda-liste">
          {aVenir.map((r) => {
            const t = quand(r.requestedAt);
            return (
              <li key={r.id} className={`agenda-item${t.passe ? " agenda-item--passe" : ""}`}>
                <div className="agenda-quand">
                  <span className="agenda-jour">{t.jour}</span>
                  <span className="agenda-heure">{t.heure}</span>
                </div>
                <div className="agenda-qui">
                  <span className="agenda-nom">{r.clientName}</span>
                  {/* Le numéro est un lien d'appel : sur un chantier, on ne
                      recopie pas un numéro à la main. */}
                  <a className="agenda-tel" href={`tel:${r.clientPhone}`}>
                    {r.clientPhone}
                  </a>
                </div>
                {r.details ? <p className="agenda-details">{r.details}</p> : null}
                <div className="agenda-actions">
                  <button
                    type="button"
                    className="agenda-btn agenda-btn--ok"
                    disabled={enCours === r.id}
                    onClick={() => void agir(r.id, "honored")}
                  >
                    Intervention faite
                  </button>
                  <button
                    type="button"
                    className="agenda-btn"
                    disabled={enCours === r.id}
                    onClick={() => void agir(r.id, "canceled")}
                  >
                    Annulé
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {traites.length > 0 && (
        <>
          <h3 className="agenda-sous-titre">Traités</h3>
          <ul className="agenda-liste agenda-liste--traites">
            {traites.map((r) => {
              const t = quand(r.requestedAt);
              return (
                <li key={r.id} className="agenda-item agenda-item--traite">
                  <span className="agenda-jour">
                    {t.jour} · {t.heure}
                  </span>
                  <span className="agenda-nom">{r.clientName}</span>
                  <span className="agenda-statut">
                    {r.status === "honored" ? "Fait" : "Annulé"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
