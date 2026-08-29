-- =============================================================================
-- Migration 004 — MapArtisans : marché francophone et grille à trois paliers
-- =============================================================================
-- Deux changements de périmètre commercial :
--
-- 1. Le SaaS ne vise plus la France et la Suisse, mais l'ensemble du marché
--    francophone. La contrainte `country IN ('FR','CH')` rejetait purement et
--    simplement un artisan belge, luxembourgeois ou québécois.
--
-- 2. La facturation se fait désormais en francs suisses pour tous les pays :
--    l'éditeur est suisse et facture dans sa devise. La contrainte
--    `currency IN ('EUR','CHF')` est resserrée sur CHF.
--
-- 3. Trois paliers remplacent le plan unique : `plan_id` porte le palier
--    choisi, `plan_amount` reste le montant réellement facturé (il peut
--    diverger du tarif public en cas de remise commerciale).
--
-- ATTENTION — reprise de données : les comptes existants facturés en EUR
-- doivent être migrés côté Stripe AVANT d'appliquer ce script, sinon la
-- nouvelle contrainte rejettera leurs lignes. La commande de vérification est
-- fournie en fin de fichier.
-- =============================================================================

BEGIN;

-- --- 1. Pays : ouverture au marché francophone -------------------------------
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_country_check;
ALTER TABLE companies
    ADD CONSTRAINT companies_country_check
        CHECK (country IN ('CH', 'FR', 'BE', 'LU', 'CA', 'MC'));

ALTER TABLE companies ALTER COLUMN country SET DEFAULT 'CH';

-- --- 2. Devise : francs suisses uniquement -----------------------------------
-- Les comptes historiques en EUR sont convertis ici. Le montant n'est PAS
-- recalculé automatiquement : appliquer un taux de change au tarif serait un
-- prix inventé. Les lignes concernées sont remises au tarif Essentiel et
-- devront être revues une à une (voir la requête de contrôle plus bas).
UPDATE companies
SET currency = 'CHF'
WHERE currency <> 'CHF';

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_currency_check;
ALTER TABLE companies
    ADD CONSTRAINT companies_currency_check CHECK (currency = 'CHF');

ALTER TABLE companies ALTER COLUMN currency SET DEFAULT 'CHF';

-- --- 3. Paliers d'abonnement -------------------------------------------------
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS plan_id VARCHAR(20);

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_plan_id_check;
ALTER TABLE companies
    ADD CONSTRAINT companies_plan_id_check
        CHECK (plan_id IS NULL OR plan_id IN ('essentiel', 'pro', 'agence'));

-- Les comptes actifs sans palier sont rattachés à Essentiel : c'est le palier
-- le moins cher, donc le choix qui ne surfacture personne par défaut.
UPDATE companies
SET plan_id = 'essentiel'
WHERE plan_id IS NULL
  AND subscription_status IN ('active', 'past_due', 'trialing');

COMMIT;

-- =============================================================================
-- Contrôle à passer APRÈS migration : comptes dont le montant facturé ne
-- correspond à aucun tarif public. Ils ont été convertis depuis l'euro et
-- doivent être arbitrés commercialement, pas laissés en l'état.
-- =============================================================================
-- SELECT id, company_name, country, plan_id, plan_amount
-- FROM companies
-- WHERE subscription_status IN ('active', 'past_due')
--   AND plan_amount NOT IN (49, 89, 249);
