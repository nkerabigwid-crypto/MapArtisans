-- 025 — Rappel avant la fin de l'essai.
--
-- POURQUOI UNE COLONNE ET PAS UN CALCUL
--
-- Le rappel part la veille de l'expiration. Sans trace de l'envoi, le
-- planificateur — qui passe toutes les cinq minutes — le renverrait a chaque
-- tour pendant vingt-quatre heures, soit pres de 300 SMS par artisan.
--
-- L'horodatage sert de verrou ET de trace : on sait quand le rappel est parti,
-- ce qui permet de repondre a un client qui affirme n'avoir rien recu.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN companies.trial_reminder_sent_at IS
    'Envoi du rappel de fin d''essai. NULL = pas encore envoye. Sert de verrou '
    'contre le renvoi a chaque passage du planificateur.';

COMMIT;

-- Verification :
-- SELECT company_name, trial_ends_at, trial_reminder_sent_at FROM companies
--  WHERE trial_ends_at IS NOT NULL ORDER BY trial_ends_at;
