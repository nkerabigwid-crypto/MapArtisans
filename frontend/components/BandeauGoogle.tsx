"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Retour du rattachement de fiche Google.
 *
 * Sans ce bandeau, l'artisan revient de l'écran de consentement Google sur un
 * tableau de bord inchangé, et ne peut pas savoir si le rattachement a réussi.
 * Le doute le pousse à recommencer, puis à écrire au support.
 *
 * Le motif est lu depuis l'URL puis EFFACÉ : laissé en place, il réapparaîtrait
 * à chaque rechargement, et « Fiche Google connectée » s'afficherait encore
 * trois jours plus tard.
 */

const MESSAGES: Record<string, { ton: "bon" | "info" | "alerte"; titre: string; corps: string }> = {
  connecte: {
    ton: "bon",
    titre: "Fiche Google connectée",
    corps:
      "Vos avis vont commencer à remonter. Le premier relevé de position arrive sous 24 heures.",
  },
  annule: {
    ton: "info",
    titre: "Connexion interrompue",
    corps:
      "Vous avez quitté l'écran Google avant la fin. Aucune donnée n'a été échangée, vous pouvez recommencer quand vous voulez.",
  },
  "aucun-etablissement": {
    ton: "alerte",
    titre: "Aucun établissement sur ce compte Google",
    corps:
      "Ce compte Google ne gère aucune fiche d'établissement. Vérifiez que vous vous êtes connecté avec le compte qui administre votre fiche, et que celle-ci est bien validée par Google.",
  },
  indisponible: {
    ton: "info",
    titre: "Connexion Google bientôt disponible",
    corps:
      "Le rattachement automatique de fiche n'est pas encore ouvert. Vos avis restent gérés normalement en attendant.",
  },
  echec: {
    ton: "alerte",
    titre: "La connexion n'a pas abouti",
    corps:
      "Google a refusé l'échange, ou la demande a expiré. Réessayez ; si cela se reproduit, écrivez-nous.",
  },
};

export default function BandeauGoogle() {
  /*
   * `useSearchParams` plutôt qu'une lecture de window dans un effet : le motif
   * est disponible au PREMIER rendu, sans passer par un setState qui
   * provoquerait un second rendu en cascade de tout le tableau de bord.
   */
  const params = useSearchParams();
  const recu = params.get("google");
  const motif = recu && recu in MESSAGES ? recu : null;

  const [ferme, setFerme] = useState(false);

  useEffect(() => {
    if (!motif) return;
    /*
     * Le paramètre est retiré de la barre d'adresse une fois lu. Laissé en
     * place, « Fiche Google connectée » réapparaîtrait à chaque rechargement,
     * et encore trois jours plus tard.
     *
     * `replaceState` et non `push` : un retour arrière ne doit pas ramener le
     * bandeau. Next ne réévalue pas useSearchParams sur replaceState, donc le
     * bandeau reste affiché pour cette visite — c'est voulu.
     */
    const restants = new URLSearchParams(window.location.search);
    restants.delete("google");
    const reste = restants.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (reste ? `?${reste}` : ""),
    );
  }, [motif]);

  if (!motif || ferme) return null;
  const message = MESSAGES[motif];

  return (
    <div className={`bandeau-google bandeau-google--${message.ton}`} role="status">
      <div className="bandeau-google-titre">{message.titre}</div>
      <p className="bandeau-google-corps">{message.corps}</p>
      <button
        type="button"
        className="bandeau-google-fermer"
        onClick={() => setFerme(true)}
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  );
}
