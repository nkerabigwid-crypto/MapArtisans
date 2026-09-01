import Link from "next/link";
import Logo from "./Logo";

interface EntetePublicProps {
  /**
   * Les ancres « Fonctionnalités » et « Tarifs » pointent vers des sections de
   * la page d'accueil. Ailleurs, elles doivent viser `/#…` et non `#…`, sinon
   * un clic depuis /connexion ne va nulle part.
   */
  surAccueil?: boolean;
  /**
   * Masque le lien « Connexion » sur la page de connexion elle-même : un lien
   * vers la page où l'on se trouve déjà n'aide personne et fait douter.
   */
  masquerConnexion?: boolean;
}

/**
 * En-tête commun à toutes les pages publiques.
 *
 * POURQUOI IL EST PARTAGÉ
 *
 * La page d'accueil portait une navigation complète ; connexion, inscription et
 * pages légales n'affichaient qu'un logo seul, centré. La différence était
 * visible et coûteuse : arrivé sur la connexion, on ne pouvait plus revenir aux
 * tarifs ni aux fonctionnalités sans retaper l'adresse. Une page nue se lit
 * aussi comme une page inachevée, juste avant de saisir un mot de passe.
 *
 * Le tableau de bord garde son propre en-tête (TopBar) : il s'adresse à un
 * client connecté, pas à un visiteur, et lui proposer « Essai gratuit » serait
 * absurde.
 */
export default function EntetePublic({
  surAccueil = false,
  masquerConnexion = false,
}: EntetePublicProps) {
  const prefixe = surAccueil ? "" : "/";

  return (
    <header className="lp-nav">
      <Link href="/" aria-label="Accueil MapArtisans">
        <Logo className="lp-logo" taille={1.25} />
      </Link>
      <nav className="lp-nav-links">
        <Link href={`${prefixe}#fonctionnalites`}>Fonctionnalités</Link>
        <Link href={`${prefixe}#tarifs`}>Tarifs</Link>
      </nav>
      <div className="lp-nav-actions">
        {masquerConnexion ? null : (
          <Link href="/connexion" className="lp-nav-login">
            Connexion
          </Link>
        )}
        <Link href="/onboarding" className="lp-nav-cta">
          Essai gratuit
        </Link>
      </div>
    </header>
  );
}
