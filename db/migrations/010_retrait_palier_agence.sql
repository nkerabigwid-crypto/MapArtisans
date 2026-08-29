-- 010 — Retrait du palier revendeur « agence ».
--
-- POURQUOI
--
-- Revendu par une agence avec sa marge, le même logiciel arrivait plus cher
-- chez l'artisan que le prix affiché sur notre propre page de tarifs. Le jour
-- où un artisan compare, c'est l'éditeur qui perd la confiance, pas seulement
-- l'agence. Il n'y a désormais qu'un prix public, le même pour tout le monde :
-- une agence qui gère cinq clients souscrit cinq abonnements au tarif affiché.
--
-- CE QUI N'EST PAS SUPPRIMÉ ICI
--
-- La table `agency_settings` et la mécanique de marque blanche (domaine
-- personnalisé, logo, couleur) restent en place. Ce sont deux choses
-- distinctes : le palier était un TARIF, la marque blanche est une CAPACITÉ.
-- Rien n'empêche demain une agence de payer le prix public par client tout en
-- affichant sa propre marque. Supprimer ces tables serait une porte à sens
-- unique ; les garder dormantes ne coûte rien tant qu'aucune ligne n'existe.

BEGIN;

-- Aucun compte en production ne porte ce palier (rien n'est déployé). Le
-- UPDATE est néanmoins écrit : si un compte de test le porte, il bascule sur
-- la formule d'entrée plutôt que de faire échouer la contrainte ci-dessous.
UPDATE companies SET plan_id = 'essentiel' WHERE plan_id = 'agence';

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_plan_id_check;
ALTER TABLE companies
    ADD CONSTRAINT companies_plan_id_check
        CHECK (plan_id IS NULL OR plan_id IN ('essentiel', 'pro'));

COMMIT;

-- Vérification :
-- SELECT plan_id, COUNT(*) FROM companies GROUP BY plan_id;
