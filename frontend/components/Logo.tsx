/**
 * Logo MapArtisans.
 *
 * LE SYMBOLE
 *
 * Un repère de carte dont le centre est une position au sol. C'est la forme
 * que Google Maps a rendue universelle : un artisan la reconnaît sans qu'on
 * la lui explique, et elle dit exactement ce que fait le produit — vous placer
 * sur la carte.
 *
 * Pas d'outil, pas de clé à molette : le service n'est pas la plomberie, c'est
 * la visibilité. Une icône de métier aurait aussi exclu les taxis, qui sont la
 * moitié de la cible.
 *
 * POURQUOI EN SVG, DANS LE CODE
 *
 * Il s'adapte à toutes les tailles sans perte, hérite de la couleur courante,
 * et ne coûte aucune requête réseau. Un PNG imposerait plusieurs fichiers et
 * flouterait sur les écrans à haute densité.
 */

interface LogoProps {
  /** Hauteur du symbole en rem. Le texte suit la taille de police héritée. */
  taille?: number;
  /** Masque le nom : pour les espaces contraints, comme une barre mobile. */
  symboleSeul?: boolean;
  className?: string;
}

export function LogoMark({ taille = 1.15 }: { taille?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      style={{ height: `${taille}em`, width: `${taille}em`, flexShrink: 0 }}
      // aria-hidden : le nom qui suit porte déjà l'information. Annoncer deux
      // fois « MapArtisans » à un lecteur d'écran est une gêne, pas un service.
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 2.5c-5.1 0-9.2 4.1-9.2 9.2 0 6.9 9.2 17.8 9.2 17.8s9.2-10.9 9.2-17.8c0-5.1-4.1-9.2-9.2-9.2z"
        fill="currentColor"
      />
      {/* Le creux central prend la couleur du fond : le repère reste lisible
          aussi bien sur clair que sur foncé, sans seconde version. */}
      <circle cx="16" cy="11.7" r="3.6" fill="var(--paper, #f4f3ef)" />
    </svg>
  );
}

export default function Logo({ taille = 1.15, symboleSeul = false, className }: LogoProps) {
  return (
    <span className={`logo${className ? ` ${className}` : ""}`}>
      <LogoMark taille={taille} />
      {!symboleSeul && (
        <span className="logo-nom">
          MapArtisan<span className="logo-s">s</span>
        </span>
      )}
    </span>
  );
}
