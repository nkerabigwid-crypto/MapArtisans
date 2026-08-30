/**
 * Repère de position pour la Geo-Grid.
 *
 * Partagé par la démonstration de la page d'accueil et le tableau de bord :
 * les deux affichaient la même chose sous deux formes différentes, et la
 * correction de l'ordinal « 1re » n'avait été faite que d'un côté.
 *
 * La forme dit elle-même « position sur la carte » et reprend le symbole du
 * logo. Le rang s'inscrit dans un disque clair au centre de la tête, ce qui
 * garantit son contraste sur les quatre couleurs de statut — l'ambre, la plus
 * claire, ne laisserait pas passer du blanc.
 */

interface GeoPinProps {
  /** Position relevée. `null` = fiche introuvable dans les résultats. */
  position: number | null;
  /** Classe de statut : top1, top3, warn, bad. Porte la couleur. */
  status: string;
  className?: string;
}

export default function GeoPin({ position, status, className }: GeoPinProps) {
  return (
    <svg
      className={`geo-pin ${status}${className ? ` ${className}` : ""}`}
      viewBox="0 0 40 48"
      aria-hidden="true"
    >
      <path
        d="M20 1.5C10.6 1.5 3 9.1 3 18.5c0 12.4 17 28 17 28s17-15.6 17-28c0-9.4-7.6-17-17-17z"
        fill="currentColor"
      />
      <circle cx="20" cy="18.5" r="11.5" fill="var(--paper)" />
      <text
        x="20"
        y="18.5"
        textAnchor="middle"
        dominantBaseline="central"
        className="geo-pin-rang"
        fill="currentColor"
      >
        {position === null ? "—" : position}
      </text>
    </svg>
  );
}
