-- =============================================================================
-- Migration 003 — MapArtisans : points de grille enrichis
-- =============================================================================
-- La Geo-Grid n'affiche plus seulement une couleur : au tap sur un point, elle
-- indique le quartier, la position exacte, et la fiche classée 1re à cet
-- endroit. Ces deux dernières informations n'avaient pas de place au schéma.
--
-- Ce que cette migration corrige aussi : `grid_coordinates` et
-- `ranking_positions` étaient deux tableaux JSONB **parallèles**, dont la
-- correspondance reposait uniquement sur l'ordre des index. Rien n'empêchait
-- qu'ils divergent en longueur, et rien ne le signalait. `grid_points` réunit
-- chaque point dans un seul objet, ce qui rend cette classe de bug impossible.
--
-- Structure attendue de grid_points :
--   [
--     {
--       "label": "A1",
--       "area": "Préfecture",
--       "lat": 45.7640,
--       "lng": 4.8450,
--       "position": 1,              -- null si la fiche est introuvable
--       "top_competitor": null      -- nom de la fiche 1re, null si c'est nous
--     },
--     ...
--   ]
--
-- Règle de couleur appliquée côté application (voir lib/data.ts,
-- getGridStatus) : 1 → vert profond, 2-3 → vert, 4-10 → ambre,
-- > 10 ou null → rouge. Le seuil de 3 vient du Local Pack, qui n'affiche que
-- trois résultats sans interaction supplémentaire.
--
-- Migration additive : les deux anciennes colonnes sont conservées le temps de
-- la reprise des données historiques, puis pourront être supprimées.
-- =============================================================================

BEGIN;

ALTER TABLE rank_trackings
    ADD COLUMN IF NOT EXISTS grid_points JSONB;

COMMENT ON COLUMN rank_trackings.grid_points IS
    'Points de la grille : label, area, lat, lng, position (null = introuvable), top_competitor. Remplace le couple grid_coordinates / ranking_positions.';

COMMENT ON COLUMN rank_trackings.grid_coordinates IS
    'OBSOLÈTE depuis la migration 003 — utiliser grid_points.';
COMMENT ON COLUMN rank_trackings.ranking_positions IS
    'OBSOLÈTE depuis la migration 003 — utiliser grid_points.';

-- Reprise des scans existants : on fusionne les deux tableaux parallèles en un
-- seul. Le quartier et le concurrent restent nuls — ils n'ont jamais été
-- collectés, et les inventer fausserait l'historique.
UPDATE rank_trackings
SET grid_points = (
    SELECT jsonb_agg(
        jsonb_build_object(
            'label',          'P' || (coord.ord::text),
            'area',           NULL,
            'lat',            coord.value -> 'lat',
            'lng',            coord.value -> 'lng',
            'position',       pos.value,
            'top_competitor', NULL
        )
        ORDER BY coord.ord
    )
    FROM jsonb_array_elements(grid_coordinates) WITH ORDINALITY AS coord(value, ord)
    LEFT JOIN jsonb_array_elements(ranking_positions) WITH ORDINALITY AS pos(value, ord)
        ON pos.ord = coord.ord
)
WHERE grid_points IS NULL
  AND jsonb_typeof(grid_coordinates) = 'array'
  AND jsonb_typeof(ranking_positions) = 'array';

COMMIT;
