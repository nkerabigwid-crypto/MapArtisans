interface ErrorStateProps {
  /** Ce que l'app n'a pas réussi à charger, à la 3e personne : « vos avis ». */
  what: string;
  onRetry: () => void;
}

/**
 * Échec de chargement.
 *
 * Le texte dit ce qui a échoué et ce que l'artisan peut faire — pas d'excuse,
 * pas de « une erreur est survenue » qui ne renseigne sur rien. Les données de
 * la fiche Google restent intactes côté Google : c'est l'affichage qui échoue,
 * et le rappeler évite une inquiétude inutile.
 */
export default function ErrorState({ what, onRetry }: ErrorStateProps) {
  return (
    <div className="card error-state" role="alert">
      <div className="err-title">Impossible d&apos;afficher {what}</div>
      <p className="err-body">
        La connexion au serveur a échoué. Votre fiche Google n&apos;est pas affectée —
        seul l&apos;affichage n&apos;a pas pu se charger.
      </p>
      <button className="btn" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  );
}
