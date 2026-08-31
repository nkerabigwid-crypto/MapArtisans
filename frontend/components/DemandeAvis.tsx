"use client";

import { useState } from "react";

/**
 * Demande d'avis après une intervention.
 *
 * POURQUOI CE BOUTON EXISTE À CÔTÉ DU QR CODE
 *
 * Le QR code est passif : il faut que l'artisan y pense en rangeant ses
 * outils, devant un client déjà à moitié parti. Ce bouton se presse dans la
 * camionnette, deux minutes plus tard. C'est la même action, à un moment où
 * elle est réellement possible.
 *
 * CE QUE CE FORMULAIRE NE DEMANDE PAS
 *
 * Ni note, ni « le client était-il satisfait ? ». Google interdit de
 * solliciter sélectivement les avis positifs, et le seul moyen de ne pas le
 * faire est de ne jamais offrir le choix. Un champ de plus ici et l'outil
 * changerait de nature.
 */
export default function DemandeAvis({ profileId }: { profileId: string }) {
  const [numero, setNumero] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi" | "envoye">("repos");
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEtat("envoi");
    try {
      const r = await fetch("/api/avis/demander", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientPhone: numero, profileId }),
      });
      if (r.ok) {
        setEtat("envoye");
        setNumero("");
        // Le retour à l'état initial permet d'enchaîner : un artisan qui sort
        // de trois interventions en envoie trois d'affilée.
        setTimeout(() => setEtat("repos"), 4000);
        return;
      }
      const d = await r.json().catch(() => ({}));
      setErreur(d.error ?? "L'envoi a échoué.");
      setEtat("repos");
    } catch {
      setErreur("Connexion impossible. Vérifiez votre réseau.");
      setEtat("repos");
    }
  }

  return (
    <div className="card demande-avis">
      <div className="da-titre">Intervention terminée ?</div>
      <p className="da-lede">
        Envoyez la demande d&apos;avis à votre client. Il reçoit un SMS avec le lien direct — dix
        secondes pour lui.
      </p>

      <form onSubmit={envoyer} className="da-form">
        <label className="field-label" htmlFor="da-tel">
          Numéro du client
        </label>
        <input
          id="da-tel"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          required
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="+41 79 123 45 67"
          className="field-control"
          disabled={etat === "envoi"}
        />

        {erreur && (
          <p className="ob-erreur" role="alert">
            {erreur}
          </p>
        )}

        {etat === "envoye" ? (
          <p className="da-succes" role="status">
            Demande envoyée. Vous n&apos;avez plus rien à faire.
          </p>
        ) : (
          <button type="submit" className="btn" disabled={etat === "envoi" || !numero.trim()}>
            {etat === "envoi" ? "Envoi…" : "Envoyer la demande d'avis"}
          </button>
        )}
      </form>

      {/* Cette phrase n'est pas de la décoration : elle rappelle la règle à
          l'artisan au moment exact où il pourrait être tenté d'y déroger. */}
      <p className="da-regle">
        À envoyer à <strong>tous</strong> vos clients, sans exception. Choisir qui reçoit la
        demande selon sa satisfaction expose votre fiche à une suppression par Google.
      </p>
    </div>
  );
}
