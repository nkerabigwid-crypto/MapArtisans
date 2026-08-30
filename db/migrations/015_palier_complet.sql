-- 015 — Troisième palier : « Complet » à 129 CHF.
--
-- POURQUOI TROIS PALIERS
--
-- Décision commerciale : un palier au-dessus du Pro rend le Pro plus facile à
-- choisir. Face à deux prix, on prend le moins cher ; face à trois, on prend
-- celui du milieu.
--
-- CE QUE CE PALIER PROMET, ET QUI N'EXISTE PAS ENCORE
--
-- Un assistant conversationnel sur le site de l'artisan, capable de répondre
-- aux questions courantes et de poser un rendez-vous dans son agenda. Aucune
-- de ces trois briques n'est construite au 31 août 2026. La contrainte de base
-- est élargie pour que le palier puisse être vendu, mais IL NE DOIT PAS ÊTRE
-- FACTURÉ tant que la fonctionnalité n'est pas livrée.

BEGIN;

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_plan_id_check;
ALTER TABLE companies
    ADD CONSTRAINT companies_plan_id_check
        CHECK (plan_id IS NULL OR plan_id IN ('essentiel', 'pro', 'complet'));

COMMIT;

-- Vérification :
-- SELECT plan_id, COUNT(*) FROM companies GROUP BY plan_id;
