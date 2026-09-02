-- 027 — Rendre les jours d'essai decomptes avant tout rattachement de fiche.
--
-- CE QUE 026 A OUBLIE
--
-- La migration 026 a pose `trial_started_at` et la regle : l'essai commence au
-- rattachement de la fiche Google, pas a l'inscription. Mais `createCompany`
-- continuait d'ecrire `trial_ends_at = maintenant + 14 jours` a l'inscription.
-- La colonne existait, la regle etait ecrite, et le compte a rebours tournait
-- quand meme.
--
-- Consequence pour les comptes deja inscrits : leurs quatorze jours s'ecoulent
-- pendant que Google valide notre acces a son API. Ils n'ont ni avis, ni
-- position, ni rapport — le produit ne fait rien pour eux. C'est de l'attente
-- facturee en jours d'essai.
--
-- CE QUE FAIT CETTE MIGRATION
--
-- Elle remet `trial_ends_at` a NULL pour les comptes qui n'ont jamais rattache
-- de fiche. Leurs quatorze jours repartiront entiers le jour du rattachement.
--
-- CE QU'ELLE NE TOUCHE PAS
--
--   · Les comptes avec une fiche : l'essai a reellement commence, il court.
--   · `trial_started_at` non NULL : l'essai a demarre, meme si la fiche a ete
--     debranchee depuis. Le remettre a NULL offrirait quatorze jours de plus a
--     chaque debranchement.
--   · Les payants et les resilies : `trial_ends_at` n'a plus d'effet sur eux,
--     et l'ecraser detruirait un historique.
--
-- Sans risque de rejeu : la seconde execution ne trouve plus aucune ligne.

BEGIN;

UPDATE companies c
   SET trial_ends_at = NULL
 WHERE c.subscription_status = 'trialing'
   AND c.trial_ends_at IS NOT NULL
   AND c.trial_started_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM google_profiles g WHERE g.company_id = c.id);

COMMIT;

-- Verification — ces comptes doivent afficher `trial_ends_at` vide, et
-- reapparaitre dans « En attente de fiche Google » sur la console /admin :
-- SELECT company_name, subscription_status, trial_started_at, trial_ends_at
--   FROM companies ORDER BY created_at;
