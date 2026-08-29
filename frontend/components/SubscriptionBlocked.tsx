"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { Company } from "@/lib/data";
import { formatDay, formatPlanLabel } from "@/lib/data";

interface SubscriptionBlockedProps {
  company: Company;
  onReactivate: () => void;
}

/**
 * Écran de blocage — abonnement résilié.
 *
 * Contrairement à `past_due`, le blocage est ici justifié : le service a cessé,
 * afficher un dashboard vivant serait mensonger. L'écran dit donc précisément
 * ce qui s'est arrêté, et rassure sur ce qui n'a pas été perdu — la fiche Google
 * appartient à l'artisan, MapArtisans ne fait que la gérer.
 *
 * La réactivation passe par un AlertDialog et non un Dialog : l'action engage
 * un prélèvement, elle doit exiger une réponse explicite plutôt que de se
 * refermer sur un clic à côté.
 */
export default function SubscriptionBlocked({ company, onReactivate }: SubscriptionBlockedProps) {
  const stopped = [
    "les réponses automatiques à vos avis",
    "la publication de vos posts",
    "le suivi de votre position sur Maps",
  ];

  return (
    <section className="view blocked" aria-label="Abonnement résilié">
      <div className="card blocked-card">
        <div className="blocked-eyebrow">Abonnement résilié</div>
        <h2 className="blocked-title">
          {company.canceled_at
            ? `En pause depuis le ${formatDay(company.canceled_at)}`
            : "Votre abonnement a pris fin"}
        </h2>

        <p className="blocked-lede">Ce qui s&apos;est arrêté :</p>
        <ul className="blocked-list">
          {stopped.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <p className="blocked-reassure">
          Votre fiche Google reste la vôtre — rien n&apos;a été supprimé, et les avis déjà
          publiés sont intacts.
        </p>

        <AlertDialog.Root>
          <AlertDialog.Trigger className="btn blocked-cta">
            Réactiver l&apos;abonnement
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Backdrop className="sheet-backdrop" />
            <AlertDialog.Popup className="confirm-popup">
              <AlertDialog.Title className="confirm-title">
                Réactiver pour {formatPlanLabel(company)} ?
              </AlertDialog.Title>
              <AlertDialog.Description className="confirm-body">
                Le prélèvement reprend aujourd&apos;hui. Vos avis et vos posts repartent sous
                24 heures.
              </AlertDialog.Description>
              <div className="confirm-actions">
                <AlertDialog.Close className="btn secondary">Annuler</AlertDialog.Close>
                <AlertDialog.Close className="btn" onClick={onReactivate}>
                  Réactiver
                </AlertDialog.Close>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    </section>
  );
}
