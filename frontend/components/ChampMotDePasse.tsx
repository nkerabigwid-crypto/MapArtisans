"use client";

import { useId, useState } from "react";
import { Field } from "@base-ui/react/field";

/**
 * Rend UNIQUEMENT la ligne de libellé et le contrôle — pas le `Field.Root`.
 *
 * Base UI rattache `Field.Error` au contrôle situé dans le même `Field.Root` :
 * envelopper le champ dans un Root interne couperait ce lien, et les messages
 * « Choisissez un mot de passe » ou « Au moins 12 caractères » cesseraient de
 * s'afficher sans que rien ne le signale. Le parent garde donc le Root, la
 * description et les erreurs.
 */
interface ChampMotDePasseProps {
  label: string;
  value: string;
  onChange: (valeur: string) => void;
  /** `new-password` à l'inscription, `current-password` à la connexion. */
  autoComplete: "new-password" | "current-password";
  minLength?: number;
  placeholder?: string;
  required?: boolean;
}

/**
 * Champ mot de passe avec bascule d'affichage.
 *
 * POURQUOI CETTE BASCULE N'EST PAS UN CONFORT
 *
 * On demande une phrase de douze caractères minimum, tapée au pouce sur un
 * clavier de téléphone, souvent dehors et parfois avec des gants. Sans moyen de
 * relire ce qu'on a saisi, la faute de frappe ne se découvre qu'au refus de
 * connexion — et l'artisan conclut qu'il a oublié son mot de passe alors qu'il
 * l'avait mal tapé. C'est un motif d'abandon à l'inscription, pas un détail.
 *
 * Masqué par défaut : l'affichage se demande, il ne s'impose pas. Quelqu'un
 * peut regarder par-dessus l'épaule.
 *
 * DU TEXTE PLUTÔT QU'UN ŒIL
 *
 * L'icône d'œil est ambiguë — barré, veut-il dire « c'est masqué » ou
 * « cliquez pour masquer » ? Personne n'est d'accord, y compris entre grandes
 * applications. « Afficher » / « Masquer » ne se discute pas.
 */
export default function ChampMotDePasse({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  placeholder,
  required = true,
}: ChampMotDePasseProps) {
  const [visible, setVisible] = useState(false);
  const idAide = useId();

  return (
    <>
      <div className="mdp-entete">
        <Field.Label className="field-label">{label}</Field.Label>
        <button
          type="button"
          className="mdp-bascule"
          onClick={() => setVisible((v) => !v)}
          // `aria-pressed` dit l'ÉTAT ; le libellé dit l'ACTION. Un lecteur
          // d'écran annonce alors « Afficher, non pressé », sans ambiguïté.
          aria-pressed={visible}
          aria-describedby={idAide}
        >
          {visible ? "Masquer" : "Afficher"}
        </button>
      </div>

      <Field.Control
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        /*
         * `autoComplete` est conservé à l'identique quand le champ passe en
         * clair : le changer ferait perdre le fil aux gestionnaires de mots de
         * passe, qui cesseraient de proposer l'enregistrement au milieu de la
         * saisie.
         */
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field-control"
      />

      <span id={idAide} className="mdp-aide">
        {visible ? "Votre mot de passe est visible à l'écran." : ""}
      </span>
    </>
  );
}
