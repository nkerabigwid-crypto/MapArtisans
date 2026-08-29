"use client";

import { Field } from "@base-ui/react/field";
import { Form } from "@base-ui/react/form";

export interface ContactDraft {
  email: string;
  phone_number: string;
}

interface StepContactProps {
  draft: ContactDraft;
  onChange: (patch: Partial<ContactDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepContact({ draft, onChange, onNext, onBack }: StepContactProps) {
  const complete = draft.email.trim() !== "" && draft.phone_number.trim() !== "";

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
        <button type="submit" className="btn" disabled={!complete}>
          Continuer
        </button>
      </div>
    </Form>
  );
}
