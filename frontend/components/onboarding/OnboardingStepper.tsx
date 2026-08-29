interface OnboardingStepperProps {
  current: number;
  labels: string[];
}

/**
 * Indicateur d'étape.
 *
 * La numérotation est justifiée ici : l'inscription est une vraie séquence —
 * on ne peut pas connecter sa fiche Google avant d'avoir dit quel métier on
 * exerce. Le numéro porte donc une information, il ne décore pas.
 */
export default function OnboardingStepper({ current, labels }: OnboardingStepperProps) {
  return (
    <nav className="stepper" aria-label="Progression de l'inscription">
      <ol className="stepper-list">
        {labels.map((label, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={label} className={`stepper-item ${state}`}>
              <span className="stepper-dot" aria-hidden="true">
                {i < current ? "✓" : i + 1}
              </span>
              <span className="stepper-label">{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        Étape {current + 1} sur {labels.length} : {labels[current]}
      </p>
    </nav>
  );
}
