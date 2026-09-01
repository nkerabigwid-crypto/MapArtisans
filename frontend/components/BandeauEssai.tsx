import Link from "next/link";

/**
 * Bandeau d'essai gratuit.
 *
 * Il annonce ce qu'il reste, pas ce qui a été consommé : « il vous reste
 * 3 jours » se lit d'un coup d'œil, « jour 4 sur 7 » demande un calcul.
 *
 * Il n'apparaît qu'à partir du dernier tiers. Affiché dès le premier jour, il
 * transformerait la semaine d'essai en compte à rebours anxieux, alors que
 * c'est le moment où l'artisan doit découvrir le produit tranquillement.
 */
export default function BandeauEssai({
  jours,
  onVoirFormules,
}: {
  jours: number;
  onVoirFormules: () => void;
}) {
  const urgent = jours <= 2;

  return (
    <div className={`essai-bandeau${urgent ? " essai-bandeau--urgent" : ""}`} role="status">
      <div className="essai-texte">
        <span className="essai-titre">
          {jours === 1 ? "Dernier jour d'essai" : `Encore ${jours} jours d'essai`}
        </span>
        <span className="essai-corps">
          {/* Ce qui est conservé compte plus que ce qui s'arrête : un artisan
              qui craint de perdre son travail hésite à laisser filer. */}
          Vos avis, vos réponses et vos réglages sont conservés à la fin de
          l&apos;essai.
        </span>
      </div>
      <button type="button" className="essai-cta" onClick={onVoirFormules}>
        Choisir une formule
      </button>
    </div>
  );
}

/**
 * Écran affiché quand l'accès est fermé — essai terminé ou abonnement arrêté.
 *
 * Il remplace tout le contenu plutôt que de le griser : montrer des données
 * qu'on ne met plus à jour serait mensonger, et laisser naviguer entre des
 * écrans inertes n'a pas de sens.
 */
export function AccesFerme({ message }: { message: string }) {
  return (
    <div className="essai-ferme">
      <h1 className="essai-ferme-titre">Reprenons où vous en étiez</h1>
      <p className="essai-ferme-texte">{message}</p>
      <Link href="/abonnement" className="essai-ferme-cta">
        Voir les formules
      </Link>
      <p className="essai-ferme-note">
        Sans engagement, résiliable en un clic. Rien n&apos;est supprimé.
      </p>
    </div>
  );
}
