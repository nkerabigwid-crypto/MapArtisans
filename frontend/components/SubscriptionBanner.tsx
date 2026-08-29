import type { Company } from "@/lib/data";
import { formatDay } from "@/lib/data";

interface SubscriptionBannerProps {
  company: Company;
  onFixPayment: () => void;
}

/**
 * Bandeau de paiement en échec.
 *
 * Volontairement NON bloquant : l'artisan est un client en règle dont la carte
 * a été refusée. Le couper de ses avis n'accélère pas le paiement et abîme la
 * relation — on prévient, on donne une échéance, on laisse travailler.
 *
 * Le message annonce une date d'interruption concrète plutôt qu'un vague
 * « veuillez régulariser » : c'est ce qui rend l'urgence lisible.
 */
export default function SubscriptionBanner({ company, onFixPayment }: SubscriptionBannerProps) {
  const { grace_period_ends_at } = company;

  return (
    <div className="sub-banner" role="status">
      <div className="sub-banner-text">
        <div className="sub-banner-title">Paiement refusé</div>
        <p className="sub-banner-body">
          {grace_period_ends_at ? (
            <>
              Sans mise à jour, la gestion de votre fiche s&apos;interrompt le{" "}
              <b>{formatDay(grace_period_ends_at)}</b>. Vos avis continuent d&apos;être traités
              jusque-là.
            </>
          ) : (
            <>Votre dernier prélèvement a échoué. Mettez à jour votre moyen de paiement.</>
          )}
        </p>
      </div>
      <button className="btn sub-banner-btn" onClick={onFixPayment}>
        Mettre à jour le paiement
      </button>
    </div>
  );
}
