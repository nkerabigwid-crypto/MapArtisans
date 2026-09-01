"use client";

import { useState } from "react";
import type { ClientAffiche } from "@/lib/server/tableauDeBord";

interface ListeClientsProps {
  clients: ClientAffiche[];
  /** Relance d'une demande d'avis. Renvoie le message d'erreur, ou `null`. */
  onDemanderAvis: (phone: string) => Promise<string | null>;
}

/**
 * Répertoire des clients servis.
 *
 * IL N'EXISTE PAS DE TABLE « CLIENTS », ET C'EST VOULU
 *
 * Cette liste est reconstruite à partir des rendez-vous pris par l'assistant et
 * des demandes d'avis déjà envoyées. Tenir un fichier clients créerait une base
 * de données personnelles à protéger, déclarer et purger, pour une valeur que
 * ces deux sources donnent déjà.
 *
 * L'artisan y retrouve donc exactement les personnes avec qui MapArtisans a
 * réellement été en contact — ni plus, ni moins.
 */

function jour(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" }) : null;
}

export default function ListeClients({ clients, onDemanderAvis }: ListeClientsProps) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  async function demander(phone: string) {
    setEnCours(phone);
    const erreur = await onDemanderAvis(phone);
    setMessages((m) => ({
      ...m,
      [phone]: erreur ?? "Demande envoyée.",
    }));
    setEnCours(null);
  }

  if (clients.length === 0) {
    return (
      <section className="view" aria-label="Vos clients">
        <div className="section-label">Vos clients</div>
        <p className="clients-vide">
          Les personnes à qui vous avez demandé un avis, et celles dont
          l&apos;assistant a pris le rendez-vous, apparaîtront ici. Vous pourrez
          leur redemander un avis d&apos;un geste.
        </p>
      </section>
    );
  }

  return (
    <section className="view" aria-label="Vos clients">
      <div className="section-label">Vos clients ({clients.length})</div>
      <ul className="clients-liste">
        {clients.map((c) => {
          const avis = jour(c.dernierAvisDemande);
          const rdv = jour(c.dernierRendezVous);
          return (
            <li key={c.phone} className="clients-item">
              <div className="clients-identite">
                <span className="clients-nom">{c.name ?? "Client"}</span>
                <a className="clients-tel" href={`tel:${c.phone}`}>
                  {c.phone}
                </a>
              </div>

              <div className="clients-histo">
                {rdv ? <span>Rendez-vous le {rdv}</span> : null}
                {avis ? <span>Avis demandé le {avis}</span> : null}
                {!rdv && !avis ? <span>Aucun échange enregistré</span> : null}
              </div>

              {c.desabonne ? (
                /*
                 * Un client désabonné n'est pas masqué : l'artisan doit savoir
                 * pourquoi il ne peut pas le solliciter, sinon il croit à une
                 * panne et réessaie. Le bouton disparaît, l'explication reste.
                 */
                <p className="clients-desabonne">
                  A demandé à ne plus recevoir de SMS.
                </p>
              ) : (
                <button
                  type="button"
                  className="clients-btn"
                  disabled={enCours === c.phone}
                  onClick={() => void demander(c.phone)}
                >
                  {enCours === c.phone ? "Envoi…" : "Demander un avis"}
                </button>
              )}

              {messages[c.phone] ? (
                <p className="clients-message">{messages[c.phone]}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
