import Link from "next/link";
import Logo from "@/components/Logo";
import { champsManquants, DERNIERE_REVISION } from "@/lib/legal";

/**
 * Mise en page commune aux pages légales.
 *
 * L'AVERTISSEMENT DE CONFIGURATION EST VISIBLE, PAS SILENCIEUX
 *
 * Tant que l'identité de l'éditeur n'est pas renseignée, la page l'annonce en
 * haut, en rouge. C'est délibéré : une page légale incomplète qui en aurait
 * l'air complète est le pire des deux mondes — elle donne l'illusion de la
 * conformité tout en manquant précisément ce que la loi exige.
 */
export default function PageLegale({
  titre,
  enTete,
  children,
}: {
  titre: string;
  enTete?: string;
  children: React.ReactNode;
}) {
  const manquants = champsManquants();

  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" aria-label="Retour à l'accueil MapArtisans">
          <Logo taille={1.25} className="lp-logo" />
        </Link>
        <nav className="lp-nav-links">
          <Link href="/questions">Questions</Link>
          <Link href="/#tarifs">Tarifs</Link>
        </nav>
      </header>

      <main className="legal">
        <h1 className="legal-h1">{titre}</h1>
        {enTete && <p className="legal-lede">{enTete}</p>}

        {manquants.length > 0 && (
          <div className="legal-alerte" role="alert">
            <strong>Page incomplète.</strong> Il manque : {manquants.join(", ")}. Ces
            informations sont exigées par la loi et doivent être renseignées dans les variables
            d&apos;environnement avant toute mise en vente.
          </div>
        )}

        {children}

        <p className="legal-revision">Dernière révision : {DERNIERE_REVISION}.</p>
      </main>

      <footer className="lp-footer">
        <span>MapArtisans — Suisse</span>
        <nav>
          <Link href="/">Accueil</Link>
          <Link href="/mentions-legales">Mentions légales</Link>
          <Link href="/confidentialite">Confidentialité</Link>
          <Link href="/cgv">CGV</Link>
        </nav>
      </footer>
    </div>
  );
}
