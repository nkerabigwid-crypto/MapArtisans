-- 011 — `place_id` sur les fiches, pour le QR code de collecte d'avis.
--
-- POURQUOI UNE COLONNE DE PLUS
--
-- `google_location_id` vient de l'API Business Profile ; `place_id` vient de
-- l'API Places. Les deux désignent le même établissement, mais ce ne sont PAS
-- les mêmes chaînes, et seul le place_id construit le lien vers le formulaire
-- d'avis Google :
--
--   https://search.google.com/local/writereview?placeid=<place_id>
--
-- Intervertir les deux produit un lien qui ne mène nulle part. Le QR code étant
-- destiné à l'impression — factures, autocollants de carrosserie — l'erreur ne
-- se corrige pas à distance : elle se réimprime.
--
-- Nullable : le place_id est résolu après la connexion OAuth de l'artisan, pas
-- au moment où la fiche est créée. Le tableau de bord doit donc savoir afficher
-- « QR code en préparation » plutôt que de supposer la valeur présente.
--
-- CONFORMITÉ : le place_id est le SEUL identifiant Google que les conditions de
-- la plateforme autorisent à conserver sans limite de durée (voir migration
-- 005). Le stocker ici ne crée aucune dette de conformité supplémentaire.

BEGIN;

ALTER TABLE google_profiles ADD COLUMN IF NOT EXISTS place_id VARCHAR(255);

COMMENT ON COLUMN google_profiles.place_id IS
    'place_id Places API. Distinct de google_location_id. Sert au lien d''avis et au QR code.';

COMMIT;

-- Vérification :
-- SELECT COUNT(*) FILTER (WHERE place_id IS NULL) AS sans_place_id FROM google_profiles;
