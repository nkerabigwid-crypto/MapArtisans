-- 009 — Trois paliers : Essentiel (49), Pro (89), Agence (sur devis).
--
-- CONTEXTE
--
-- La migration 006 avait fusionné 'essentiel' et 'pro' en un palier unique
-- 'artisan' à 59 CHF. La grille repasse à deux paliers vendus en libre-service,
-- à 49 et 89 CHF, et le palier 'agence' n'est plus vendable en ligne : il reste
-- affiché « sur devis » sur le site, et donc TOUJOURS VALIDE en base — des
-- comptes agence existent et doivent continuer de fonctionner.
--
-- Le caractère « sur devis » ne se modélise pas ici : c'est une règle de
-- présentation et de tunnel d'achat (lib/data.ts, champ `signup`), pas une
-- contrainte d'intégrité. La base doit rester capable de stocker un compte
-- agence, sinon on casserait les comptes existants.
--
-- REPRISE DES DONNÉES
--
-- Les comptes 'artisan' à 59 CHF basculent sur 'essentiel'. Leur montant n'est
-- PAS réécrit : `plan_amount` porte ce qui est réellement facturé par Stripe.
-- Le changer ici désynchroniserait la base de l'abonnement Stripe, et
-- afficherait au client un prix que personne ne lui prélève.

BEGIN;

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_plan_id_check;

UPDATE companies SET plan_id = 'essentiel' WHERE plan_id = 'artisan';

ALTER TABLE companies
    ADD CONSTRAINT companies_plan_id_check
        CHECK (plan_id IS NULL OR plan_id IN ('essentiel', 'pro', 'agence'));

COMMIT;

-- Vérification :
-- SELECT plan_id, COUNT(*), MIN(plan_amount), MAX(plan_amount)
-- FROM companies GROUP BY plan_id;
