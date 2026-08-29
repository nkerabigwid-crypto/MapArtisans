-- =============================================================================
-- Migration 005 — MapArtisans : conformité Google Maps Platform
-- =============================================================================
-- CORRECTION DE CONFORMITÉ, pas une évolution fonctionnelle.
--
-- Le champ `top_competitor` de grid_points stockait le NOM de la fiche
-- concurrente classée 1re. Les conditions de la Google Maps Platform ne
-- l'autorisent pas : seul le `place_id` est exempté des restrictions de mise
-- en cache et peut être conservé sans limite de durée. Les noms
-- d'établissement, notes, avis et photos doivent être demandés en direct au
-- moment de l'affichage, jamais entreposés en base.
--
-- Référence : https://developers.google.com/maps/documentation/places/web-service/policies
--
-- Ce que la migration fait :
--   · renomme la clé `top_competitor` en `top_competitor_place_id` ;
--   · EFFACE les noms déjà stockés — ils ne peuvent pas être conservés, et
--     aucun `place_id` ne peut être reconstitué à partir d'un nom.
--
-- Conséquence à assumer : les scans historiques perdent l'identité du
-- concurrent. Les prochains scans devront enregistrer le place_id renvoyé par
-- l'API Places au moment du relevé.
--
-- À noter également : les coordonnées `lat`/`lng` de grid_points sont les
-- points de scan choisis par MapArtisans, pas des coordonnées renvoyées par
-- Google. Elles ne tombent donc pas sous la limite de 30 jours applicable aux
-- coordonnées issues de Places.
-- =============================================================================

BEGIN;

UPDATE rank_trackings
SET grid_points = (
    SELECT jsonb_agg(
        (point.value - 'top_competitor')
            || jsonb_build_object('top_competitor_place_id', NULL)
        ORDER BY point.ord
    )
    FROM jsonb_array_elements(grid_points) WITH ORDINALITY AS point(value, ord)
)
WHERE jsonb_typeof(grid_points) = 'array';

COMMENT ON COLUMN rank_trackings.grid_points IS
    'Points de la grille : label, area, lat, lng, position (null = introuvable), top_competitor_place_id. Le nom du concurrent n''est JAMAIS stocké — il est résolu en direct depuis le place_id à l''affichage (conditions Google Maps Platform).';

COMMIT;

-- =============================================================================
-- Contrôle après migration : aucune ligne ne doit encore porter la clé
-- `top_competitor`.
-- =============================================================================
-- SELECT id, tracked_at
-- FROM rank_trackings
-- WHERE grid_points::text LIKE '%"top_competitor"%';
