"use client";

import { Popover } from "@base-ui/react/popover";
import type { GeoGrid, GeoPoint } from "@/lib/data";
import { getGridStatus, resolveCompetitorName } from "@/lib/data";

interface GeoGridCardProps {
  geoGrid: GeoGrid;
}

// Le libellé complète la position, il ne la répète pas : il dit ce que cette
// position vaut commercialement.
const STATUS_LABEL: Record<string, string> = {
  top1: "Captation maximale",
  top3: "Visible dans le top 3",
  warn: "Première page, mais masquée",
  bad: "Hors radar",
};

function positionText(point: GeoPoint) {
  if (point.position === null) return "Fiche introuvable dans les résultats";
  return `${point.position}${point.position === 1 ? "re" : "e"} position`;
}

/**
 * Grille de visibilité.
 *
 * On ouvre le détail au **tap**, pas au survol : l'artisan consulte ce tableau
 * depuis son téléphone, où le survol n'existe pas. Un Tooltip (survol + focus)
 * rendrait l'information inaccessible sur l'usage principal de l'app — d'où le
 * Popover, qui répond au tap comme au clic et reste atteignable au clavier.
 */
export default function GeoGridCard({ geoGrid }: GeoGridCardProps) {
  return (
    <div className="card">
      <div className="grid-keyword">« {geoGrid.keyword} »</div>

      {geoGrid.points.length === 0 ? (
        <div className="empty-state">
          Premier scan en cours — les résultats arrivent sous 48h.
        </div>
      ) : (
        <>
          <div className="geo-grid">
            {geoGrid.points.map((point) => {
              const status = getGridStatus(point.position);
              // Nom résolu à l'affichage depuis le place_id — jamais lu en base.
              const rivalName = resolveCompetitorName(point.top_competitor_place_id);
              return (
                <Popover.Root key={point.label}>
                  <Popover.Trigger
                    className={`geo-dot ${status}`}
                    aria-label={`${point.area} — ${positionText(point)}`}
                  >
                    {/* Un repère de carte plutôt qu'un rond : la forme dit
                        elle-même « position sur la carte », et reprend le
                        symbole du logo. Le rang est LISIBLE sans toucher —
                        devoir taper les neuf points pour savoir où l'on en est
                        annule l'intérêt d'une Geo-Grid. Le clic garde son rôle :
                        il révèle le concurrent qui devance. */}
                    <svg className="geo-pin" viewBox="0 0 40 48" aria-hidden="true">
                      <path
                        d="M20 1.5C10.6 1.5 3 9.1 3 18.5c0 12.4 17 28 17 28s17-15.6 17-28c0-9.4-7.6-17-17-17z"
                        fill="currentColor"
                      />
                      {/* Disque clair dans la tête : il porte le chiffre et
                          garantit son contraste sur les quatre couleurs de
                          statut, y compris l'ambre, la plus claire. */}
                      <circle cx="20" cy="18.5" r="11.5" fill="var(--paper)" />
                      <text
                        x="20"
                        y="18.5"
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="geo-pin-rang"
                        fill="currentColor"
                      >
                        {point.position === null ? "—" : point.position}
                      </text>
                    </svg>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Positioner sideOffset={8} className="geo-positioner">
                      <Popover.Popup className="geo-popup">
                        <Popover.Arrow className="geo-arrow" />
                        <Popover.Title className="geo-pop-area">{point.area}</Popover.Title>
                        <div className={`geo-pop-rank ${status}`}>{positionText(point)}</div>
                        <Popover.Description className="geo-pop-status">
                          {STATUS_LABEL[status]}
                        </Popover.Description>

                        {status !== "top1" && rivalName && (
                          <>
                            <div className="geo-pop-rival">
                              Ici, c&apos;est <b>{rivalName}</b> qui est 1er.
                            </div>
                            {/* Attribution obligatoire dès qu'une donnée Places
                                est affichée hors d'une carte Google. */}
                            <div className="geo-pop-attrib">Données Google Maps</div>
                          </>
                        )}

                        {(status === "warn" || status === "bad") && (
                          <div className="geo-pop-action">
                            MapArtisans publiera un post ciblé sur ce secteur pour remonter votre
                            position.
                          </div>
                        )}
                      </Popover.Popup>
                    </Popover.Positioner>
                  </Popover.Portal>
                </Popover.Root>
              );
            })}
          </div>

          <div className="geo-legend">
            <span>
              <i className="legend-dot" style={{ background: "var(--rank-top1)" }} />
              Top 3
            </span>
            <span>
              <i className="legend-dot" style={{ background: "var(--status-warn)" }} />
              4 à 10
            </span>
            <span>
              <i className="legend-dot" style={{ background: "var(--status-bad)" }} />
              Au-delà
            </span>
          </div>
          <p className="geo-hint">Touchez un point pour voir qui vous devance.</p>
        </>
      )}
    </div>
  );
}
