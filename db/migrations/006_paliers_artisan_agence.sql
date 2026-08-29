-- =============================================================================
-- Migration 006 — MapArtisans : grille tarifaire à deux paliers
-- =============================================================================
-- La grille passe de trois paliers (essentiel / pro / agence, 49-89-249 CHF) à
-- deux (artisan / agence, 59-189 CHF).
--
-- Le changement n'est pas qu'un renommage : le second palier ne vend plus « plus
-- de fonctions » mais un AUTRE MÉTIER — l'agence web qui revend le service à ses
-- clients TPE sous sa propre marque. D'où la marque blanche et le générateur
-- d'audits, sans objet pour un artisan seul.
--
-- ATTENTION — reprise de données : les abonnés existants doivent être migrés
-- côté Stripe AVANT ce script, sinon la nouvelle contrainte rejettera leurs
-- lignes. La correspondance retenue ci-dessous est la moins pénalisante pour le
-- client (jamais de montée de gamme forcée), mais elle reste un arbitrage
-- commercial à valider, pas une évidence technique.
-- =============================================================================

BEGIN;

-- Correspondance des anciens paliers vers les nouveaux.
--   essentiel (49) → artisan (59)  : le client change de prix, à prévenir
--   pro       (89) → artisan (59)  : baisse de prix, aucune perte de fonction
--   agence   (249) → agence (189)  : baisse de prix, périmètre resserré à 5 fiches
UPDATE companies SET plan_id = 'artisan' WHERE plan_id IN ('essentiel', 'pro');

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_plan_id_check;
ALTER TABLE companies
    ADD CONSTRAINT companies_plan_id_check
        CHECK (plan_id IS NULL OR plan_id IN ('artisan', 'agence'));

COMMIT;

-- =============================================================================
-- Contrôle APRÈS migration : abonnés dont le montant ne correspond à aucun
-- tarif public. Ils viennent de l'ancienne grille et doivent être arbitrés
-- commercialement — un client qui payait 89 et se retrouve facturé 59 doit être
-- informé, pas migré en silence.
-- =============================================================================
-- SELECT id, company_name, plan_id, plan_amount
-- FROM companies
-- WHERE subscription_status IN ('active', 'past_due', 'trialing')
--   AND plan_amount NOT IN (59, 189);
