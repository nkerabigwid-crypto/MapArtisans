"use client";

import { useState } from "react";

/**
 * Simulateur de rentabilité.
 *
 * DÉCISION IMPORTANTE — ce simulateur ne prétend PAS prédire un nombre
 * d'appels. La version initialement spécifiée affichait des moyennes du type
 * « le Top 3 génère 45 appels par mois pour un plombier à Genève ». Aucune
 * source publique ne permet d'avancer un tel chiffre par métier et par ville,
 * et un prospect qui demande d'où il sort met fin à la conversation — le même
 * problème que le « 80 % des clics » écarté du script de prospection.
 *
 * Ce simulateur part donc du SEUL chiffre incontestable de la page : celui que
 * l'artisan saisit lui-même. Il ne promet rien, il calcule un seuil de
 * rentabilité. C'est plus honnête, et plus convaincant : on ne discute pas son
 * propre tarif.
 */
interface GainSimulatorProps {
  /** Montant mensuel de l'abonnement, en CHF. */
  planAmount: number;
}

const METIERS = [
  { label: "Plombier", ticket: 280 },
  { label: "Électricien", ticket: 250 },
  { label: "Chauffagiste", ticket: 350 },
  { label: "Serrurier", ticket: 200 },
  { label: "Taxi", ticket: 45 },
  { label: "Autre métier", ticket: 250 },
];

export default function GainSimulator({ planAmount }: GainSimulatorProps) {
  const [metier, setMetier] = useState(METIERS[0]);
  const [ticket, setTicket] = useState(METIERS[0].ticket);

  // Nombre d'interventions nécessaires pour couvrir l'abonnement.
  const seuil = Math.max(1, Math.ceil(planAmount / Math.max(ticket, 1)));
  const marge = ticket * seuil - planAmount;

  return (
    <div className="card sim">
      <div className="sim-row">
        <label className="sim-field">
          <span className="sim-label">Votre métier</span>
          <select
            className="field-control"
            value={metier.label}
            onChange={(e) => {
              const m = METIERS.find((x) => x.label === e.target.value) ?? METIERS[0];
              setMetier(m);
              setTicket(m.ticket);
            }}
          >
            {METIERS.map((m) => (
              <option key={m.label} value={m.label}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="sim-field">
          <span className="sim-label">
            Ce que vous facturez, en moyenne, une intervention
          </span>
          <div className="sim-input-wrap">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              className="field-control"
              value={ticket}
              onChange={(e) => setTicket(Math.max(1, Number(e.target.value) || 1))}
            />
            <span className="sim-unit">CHF</span>
          </div>
        </label>
      </div>

      <div className="sim-result" role="status">
        <div className="sim-result-n">
          {seuil} {seuil === 1 ? "intervention" : "interventions"}
        </div>
        <p className="sim-result-d">
          C&apos;est ce qu&apos;il faut pour couvrir l&apos;abonnement à {planAmount} CHF par
          mois. Au-delà, vous êtes en gain — {marge > 0 ? `${marge} CHF dès ce seuil` : "dès la suivante"}.
        </p>
        <p className="sim-note">
          Ce calcul part de votre propre tarif. Nous ne prétendons pas prédire combien
          d&apos;appels vous obtiendrez : cela dépend de votre zone, de votre concurrence et de
          l&apos;algorithme de Google, que personne ne contrôle.
        </p>
      </div>
    </div>
  );
}
