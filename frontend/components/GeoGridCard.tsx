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
                  />
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
