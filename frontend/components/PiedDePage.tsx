import Link from "next/link";
import Logo from "@/components/Logo";

/**
 * Pied de page.
 *
 * Structuré en colonnes plutôt qu'en une ligne de liens : le pied de page est
 * l'endroit où l'on cherche ce qu'on n'a pas trouvé ailleurs — les conditions,
 * la façon de nous joindre, ce que fait le produit. Une liste à plat de huit
 * liens ne se lit pas.
 *
 * Les pages légales y figurent obligatoirement : la loi exige qu'on puisse
 * identifier le fournisseur, et une page que personne ne trouve ne remplit pas
 * cette obligation.
 */
export default function PiedDePage() {
  return (
    <footer className="pdp">
      <div className="pdp-haut">
        <div className="pdp-marque">
          <Logo taille={1.2} />
          <p className="pdp-baseline">
            Visibilité Google Maps pour les artisans et les professionnels du transport.
            Suisse, France, Belgique, Luxembourg, Canada, Monaco.
          </p>
        </div>

        <nav className="pdp-colonnes" aria-label="Liens de pied de page">
          <div className="pdp-col">
            <h3 className="pdp-titre">Le produit</h3>
            <Link href="/#fonctionnalites">Fonctionnalités</Link>
            <Link href="/#tarifs">Tarifs</Link>
            <Link href="/questions">Questions fréquentes</Link>
          </div>

          <div className="pdp-col">
            <h3 className="pdp-titre">Votre compte</h3>
            <Link href="/onboarding">Créer un compte</Link>
            <Link href="/connexion">Se connecter</Link>
            <Link href="/abonnement">Abonnement</Link>
          </div>

          <div className="pdp-col">
            <h3 className="pdp-titre">Informations</h3>
            <Link href="/mentions-legales">Mentions légales</Link>
            <Link href="/confidentialite">Protection des données</Link>
            <Link href="/cgv">Conditions générales</Link>
          </div>
        </nav>
      </div>

      <div className="pdp-bas">
        {/* « Édité en Suisse » : la mention précédente accolait le nom de la marque
            au pays, ce qui se lisait comme une limite de marché. C'est le pays de
            l'éditeur, pas celui des clients — six pays francophones sont servis,
            et un artisan belge ou québécois qui croit le service réservé à la
            Suisse referme la page. */}
        <span>MapArtisans · Édité en Suisse</span>
        {/* Cette mention n'est pas décorative : le dossier d'accès à l'API
            Google demande de préciser comment les données sont obtenues, et
            un visiteur qui se demande si l'outil est légitime la cherche. */}
        <span className="pdp-mention">
          Données Google obtenues par l&apos;API officielle, avec votre consentement.
        </span>
      </div>
    </footer>
  );
}
