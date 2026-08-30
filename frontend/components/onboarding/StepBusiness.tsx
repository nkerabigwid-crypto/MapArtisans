"use client";

import { TRADES } from "@/lib/trades";
import { Field } from "@base-ui/react/field";
import { Form } from "@base-ui/react/form";
import FormSelect from "./FormSelect";

export interface BusinessDraft {
  company_name: string;
  trade_type: string | null;
  country: string | null;
}

interface StepBusinessProps {
  draft: BusinessDraft;
  onChange: (patch: Partial<BusinessDraft>) => void;
  onNext: () => void;
}


// Marché francophone, pas seulement France/Suisse. La facturation reste en CHF
// quel que soit le pays — l'éditeur est suisse.
const COUNTRIES = [
  { label: "Suisse", value: "CH" },
  { label: "France", value: "FR" },
  { label: "Belgique", value: "BE" },
  { label: "Luxembourg", value: "LU" },
  { label: "Canada", value: "CA" },
  { label: "Monaco", value: "MC" },
];

export default function StepBusiness({ draft, onChange, onNext }: StepBusinessProps) {
  const complete = draft.company_name.trim() !== "" && draft.trade_type && draft.country;

  return (
    <Form
      className="ob-form"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <h1 className="ob-title">Votre entreprise</h1>
      <p className="ob-lede">
        Ces informations servent à retrouver votre fiche sur Google et à adapter le contenu
        publié à votre métier.
      </p>

      <Field.Root name="company_name" className="field">
        <Field.Label className="field-label">Nom de l&apos;entreprise</Field.Label>
        <Field.Control
          required
          value={draft.company_name}
          onChange={(e) => onChange({ company_name: e.target.value })}
          placeholder="Dupont Plomberie"
          className="field-control"
        />
        <Field.Description className="field-desc">
          Tel qu&apos;il apparaît sur votre fiche Google.
        </Field.Description>
        <Field.Error match="valueMissing" className="field-error">
          Indiquez le nom de votre entreprise.
        </Field.Error>
      </Field.Root>

      <div className="field">
        <FormSelect
          label="Métier"
          placeholder="Choisir un métier"
          items={TRADES}
          value={draft.trade_type}
          onValueChange={(v) => onChange({ trade_type: v })}
        />
      </div>

      <div className="field">
        <FormSelect
          label="Pays"
          placeholder="Choisir un pays"
          items={COUNTRIES}
          value={draft.country}
          onValueChange={(v) => onChange({ country: v })}
        />
      </div>

      <button type="submit" className="btn ob-next" disabled={!complete}>
        Continuer
      </button>
    </Form>
  );
}
