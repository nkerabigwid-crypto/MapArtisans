import type { Metadata } from "next";
import PageLegale from "@/components/PageLegale";
import { PLANS } from "@/lib/data";
import { identiteEditeur } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Conditions générales — MapArtisans",
  description: "Conditions de vente et d'utilisation du service.",
  robots: { index: false, follow: true },
};

/**
 * Conditions générales.
 *
 * CE DOCUMENT DOIT ÊTRE RELU PAR UN JURISTE AVANT LA PREMIÈRE VENTE.
 *
 * Ce qui est écrit ici est exact sur les FAITS — prix, durée d'essai,
 * résiliation, ce que le service fait et ne fait pas — parce que ces éléments
 * se lisent dans le code. Les CLAUSES, elles, engagent contractuellement :
 * limitation de responsabilité, droit applicable, for juridique. Un modèle
 * recopié depuis un autre site engage sur des termes que personne n'a
 * vérifiés.
 *
 * Les prix viennent de PLANS : les recopier ici les laisserait diverger de la
 * page de tarifs, et une contradiction entre les deux se règle toujours en
 * faveur du client.
 */
export default function CgvPage() {
  const e = identiteEditeur();

  return (
    <PageLegale
      titre="Conditions générales"
      enTete="Ce à quoi vous vous engagez, ce à quoi nous nous engageons."
    >
      <div className="legal-alerte legal-alerte-info" role="note">
        <strong>Document à faire relire.</strong> Les faits commerciaux ci-dessous sont exacts.
        Les clauses juridiques — responsabilité, droit applicable, for — doivent être validées
        par un juriste avant la première vente.
      </div>

      <h2 className="legal-h2">1. Objet</h2>
      <p>
        MapArtisans est un service en ligne d&apos;assistance à la visibilité sur Google Maps
        pour les artisans et les professionnels du transport. Il répond aux avis reçus sur la
        fiche Google du client, mesure ses positions et lui adresse un rapport hebdomadaire.
      </p>

      <h2 className="legal-h2">2. Ce que le service ne garantit pas</h2>
      <p>
        <strong>Aucune position sur Google n&apos;est garantie.</strong> Le classement dépend de
        l&apos;algorithme de Google, des concurrents et du lieu depuis lequel la recherche est
        faite — trois éléments que l&apos;éditeur ne contrôle pas.
      </p>
      <p>
        Le service s&apos;engage sur le travail effectué : réponses rédigées et publiées,
        positions relevées, rapport envoyé. Pas sur le résultat obtenu.
      </p>

      <h2 className="legal-h2">3. Formules et prix</h2>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th>Formule</th>
              <th>Prix mensuel</th>
              <th>Établissements</th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.amount} CHF</td>
                <td>{p.maxProfiles}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Prix en francs suisses, quel que soit le pays du client — l&apos;éditeur est suisse et
        facture dans sa devise.
        {!e?.ide && " L'éditeur n'étant pas assujetti à la TVA, aucune TVA n'est facturée."}
      </p>

      <h2 className="legal-h2">4. Essai gratuit</h2>
      <p>
        Sept jours, sans carte bancaire. À l&apos;issue de l&apos;essai, aucun prélèvement
        n&apos;a lieu sans une souscription explicite.
      </p>

      <h2 className="legal-h2">5. Résiliation</h2>
      <p>
        À tout moment depuis les réglages du compte, sans préavis ni frais de sortie.
        L&apos;abonnement reste actif jusqu&apos;à la fin de la période déjà réglée. Aucun
        remboursement au prorata n&apos;est prévu.
      </p>

      <h2 className="legal-h2">6. Accès à votre fiche Google</h2>
      <p>
        L&apos;accès se fait par l&apos;API officielle de Google, après votre consentement
        explicite, et peut être révoqué à tout moment depuis votre compte Google. L&apos;éditeur
        n&apos;utilise aucun moyen d&apos;accès détourné.
      </p>
      <p>
        Vous restez seul titulaire de votre fiche. En cas de résiliation, elle reste intacte :
        les avis et réponses publiés y demeurent.
      </p>

      <h2 className="legal-h2">7. Contenu généré</h2>
      <p>
        Les réponses aux avis sont rédigées automatiquement. Un avis noté 4 ou 5 étoiles reçoit
        sa réponse sans validation ; en dessous, <strong>rien n&apos;est publié sans votre
        accord</strong>.
      </p>
      <p>
        Ces réponses sont publiées en votre nom et vous en restez responsable. Vous pouvez les
        modifier ou les supprimer depuis votre fiche à tout moment.
      </p>

      <h2 className="legal-h2">8. Vos obligations</h2>
      <ul className="legal-liste">
        <li>Fournir des informations exactes sur votre entreprise.</li>
        <li>Être titulaire de la fiche Google que vous connectez, ou dûment mandaté.</li>
        <li>Ne pas utiliser le service pour solliciter des avis en contrepartie ou de manière sélective — cela est interdit par Google et entraîne la résiliation.</li>
      </ul>

      <h2 className="legal-h2">9. Disponibilité</h2>
      <p>
        Le service est fourni sans garantie de disponibilité continue. Des interruptions peuvent
        survenir pour maintenance ou du fait de prestataires tiers, notamment Google, dont
        dépendent la lecture des avis et la publication des réponses.
      </p>

      <h2 className="legal-h2">10. Droit applicable</h2>
      <p>
        Droit suisse. For juridique au siège de l&apos;éditeur, sous réserve des dispositions
        impératives protégeant le consommateur.
      </p>

      <h2 className="legal-h2">11. Contact</h2>
      <p>
        {e ? (
          <>
            Pour toute question : <a href={`mailto:${e.email}`}>{e.email}</a>
          </>
        ) : (
          "Voir les coordonnées dans les mentions légales."
        )}
      </p>
    </PageLegale>
  );
}
