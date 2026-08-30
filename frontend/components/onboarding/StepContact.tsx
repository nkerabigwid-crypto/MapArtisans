"use client";

import { Field } from "@base-ui/react/field";
import { Form } from "@base-ui/react/form";

export interface ContactDraft {
  email: string;
  phone_number: string;
  password: string;
}

interface StepContactProps {
  draft: ContactDraft;
  onChange: (patch: Partial<ContactDraft>) => void;
  onNext: () => void;
  onBack: () => void;
  /** Message d'échec renvoyé par le serveur, affiché tel quel. */
  erreur?: string | null;
  /** Création en cours : le bouton doit être neutralisé. */
  envoi?: boolean;
}

export default function StepContact({ draft, onChange, onNext, onBack, erreur, envoi }: StepContactProps) {
  // Le minimum est aligné sur la route d'inscription (12 caractères). Le
  // vérifier ici évite un aller-retour serveur pour un refus prévisible.
  const complete =
    draft.email.trim() !== "" && draft.phone_number.trim() !== "" && draft.password.length >= 12;

  return (
    <Form
      className="ob-form"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <h1 className="ob-title">Vous joindre</h1>
      <p className="ob-lede">
        Votre e-mail sert à vous connecter. Le numéro reçoit le rapport hebdomadaire — c&apos;est
        la seule chose qu&apos;on vous envoie par SMS.
      </p>

      <Field.Root name="email" className="field">
        <Field.Label className="field-label">Adresse e-mail</Field.Label>
        <Field.Control
          type="email"
          required
          autoComplete="email"
          value={draft.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="contact@dupont-plomberie.fr"
          className="field-control"
        />
        <Field.Error match="valueMissing" className="field-error">
          Indiquez votre adresse e-mail.
        </Field.Error>
        <Field.Error match="typeMismatch" className="field-error">
          Cette adresse ne semble pas valide.
        </Field.Error>
      </Field.Root>

      <Field.Root name="password" className="field">
        <Field.Label className="field-label">Mot de passe</Field.Label>
        <Field.Control
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={draft.password}
          onChange={(e) => onChange({ password: e.target.value })}
          placeholder="Au moins 12 caractères"
          className="field-control"
        />
        {/* Une phrase plutot qu'un mot compliqué : la longueur protège mieux
            que les symboles, et se retape sur un clavier de téléphone. */}
        <Field.Description className="field-hint">
          Une phrase facile à retenir fait un excellent mot de passe : « ma camionnette bleue 2019 ».
        </Field.Description>
        <Field.Error match="valueMissing" className="field-error">
          Choisissez un mot de passe.
        </Field.Error>
        <Field.Error match="tooShort" className="field-error">
          Au moins 12 caractères.
        </Field.Error>
      </Field.Root>

      <Field.Root name="phone_number" className="field">
        <Field.Label className="field-label">Téléphone mobile</Field.Label>
        <Field.Control
          type="tel"
          required
          autoComplete="tel"
          value={draft.phone_number}
          onChange={(e) => onChange({ phone_number: e.target.value })}
          placeholder="06 12 34 56 78"
          className="field-control"
        />
        <Field.Description className="field-desc">
          Un SMS par semaine : position, appels reçus, avis à valider.
        </Field.Description>
        <Field.Error match="valueMissing" className="field-error">
          Indiquez un numéro de mobile.
        </Field.Error>
      </Field.Root>

      <div className="ob-actions">
        <button type="button" className="btn secondary" onClick={onBack}>
          Retour
        </button>
        {erreur && (
          <p className="ob-erreur" role="alert">
            {erreur}
          </p>
        )}
        <button type="submit" className="btn" disabled={!complete || envoi}>
          {envoi ? "Création du compte…" : "Continuer"}
        </button>
      </div>
    </Form>
  );
}
