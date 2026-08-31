-- 019 — `google_profiles.latitude` / `longitude` deviennent optionnelles.
--
-- POURQUOI
--
-- Le schema imposait NOT NULL sur les deux colonnes, en supposant que toute
-- fiche Google porte des coordonnees. C'est faux precisement pour le coeur de
-- notre marche.
--
-- Google distingue deux types de fiches :
--
--   · l'etablissement avec vitrine (garage, salon de coiffure) : adresse
--     publique, `latlng` renseigne ;
--   · l'etablissement de ZONE DE SERVICE (plombier, serrurier, electricien,
--     taxi, VTC) : l'artisan se deplace chez le client et masque son adresse.
--     Google ne renvoie alors ni `storefrontAddress` ni `latlng`.
--
-- Le second cas represente la majorite des metiers vises par MapArtisans.
-- Avec la contrainte NOT NULL, l'insertion du profil echouait a la connexion
-- OAuth : un plombier n'aurait jamais pu rattacher sa fiche.
--
-- Meme nature que la migration 013 : le schema exigeait une donnee que la
-- source ne fournit pas toujours.
--
-- CONSEQUENCE POUR LA GEO-GRID
--
-- La grille se centre sur ces coordonnees. Une fiche sans coordonnees ne peut
-- pas etre suivie en position tant qu'un centre n'a pas ete choisi. Mieux vaut
-- une fiche connectee dont la grille attend un centre qu'une connexion
-- impossible : les reponses aux avis, elles, fonctionnent sans coordonnees.

BEGIN;

ALTER TABLE google_profiles ALTER COLUMN latitude  DROP NOT NULL;
ALTER TABLE google_profiles ALTER COLUMN longitude DROP NOT NULL;

COMMENT ON COLUMN google_profiles.latitude IS
    'Centre de la Geo-Grid. NULL pour un etablissement de zone de service '
    '(plombier, serrurier, taxi) : Google ne publie pas ses coordonnees. '
    'Le suivi de position attend alors un centre choisi manuellement.';

COMMENT ON COLUMN google_profiles.longitude IS
    'Voir latitude.';

COMMIT;

-- Verification :
-- SELECT count(*) FILTER (WHERE latitude IS NULL) AS sans_coordonnees
--   FROM google_profiles;
