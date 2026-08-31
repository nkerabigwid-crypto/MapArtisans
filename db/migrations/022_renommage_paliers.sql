-- 022 — Renommage des paliers.
--
--   essentiel -> basique          49 CHF
--   pro       -> essentiel        99 CHF
--   complet   -> professionnel   149 CHF
--
-- POURQUOI RENOMMER AUSSI LES IDENTIFIANTS
--
-- On aurait pu ne changer que les libelles affiches et garder les identifiants
-- en base. Cela aurait cree une correspondance durablement trompeuse : le
-- palier affiche « Essentiel » aurait porte l'identifiant `pro`, et le palier
-- « Basique » l'identifiant `essentiel`.
--
-- Ce genre de decalage ne se voit pas a la lecture du code. Il se decouvre le
-- jour ou quelqu'un ecrit `planId === "essentiel"` en pensant au palier
-- d'entree, et accorde par erreur une fonctionnalite du palier intermediaire.
--
-- Le renommage est fait MAINTENANT parce qu'il est encore sans risque : aucun
-- client payant, une seule ligne en base. Dans six mois il faudrait migrer des
-- abonnements Stripe actifs.
--
-- L'ORDRE COMPTE
--
-- La remise en correspondance se fait en UNE instruction avec CASE. Deux UPDATE
-- successifs seraient faux : `essentiel -> basique` puis `pro -> essentiel`
-- passe, mais l'inverse ecraserait les lignes deja converties.

BEGIN;

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_plan_id_check;

UPDATE companies
   SET plan_id = CASE plan_id
                   WHEN 'essentiel' THEN 'basique'
                   WHEN 'pro'       THEN 'essentiel'
                   WHEN 'complet'   THEN 'professionnel'
                   ELSE plan_id
                 END
 WHERE plan_id IS NOT NULL;

ALTER TABLE companies
  ADD CONSTRAINT companies_plan_id_check
  CHECK (plan_id IS NULL OR plan_id IN ('basique', 'essentiel', 'professionnel'));

COMMENT ON COLUMN companies.plan_id IS
    'Palier souscrit : basique (49), essentiel (99), professionnel (149). '
    'Renomme le 1er septembre 2026 ; les anciens identifiants etaient '
    'essentiel / pro / complet.';

COMMIT;

-- Verification :
-- SELECT plan_id, count(*) FROM companies GROUP BY 1 ORDER BY 1;
