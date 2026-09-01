-- 024 — Essai gratuit de sept jours.
--
-- POURQUOI
--
-- Le site le promet depuis l'origine — bouton « Activer mon essai gratuit de
-- 7 jours », et la FAQ precise qu'aucune carte bancaire n'est demandee. Aucune
-- ligne de code ne l'implementait : ni date de debut, ni expiration, ni acces
-- accorde. Un compte naissait `incomplete` et le restait.
--
-- UNE COLONNE DISTINCTE DE grace_period_ends_at
--
-- La periode de grace couvre un client PAYANT dont le prelevement a echoue :
-- on le laisse travailler quelques jours pendant qu'il regularise. L'essai
-- couvre quelqu'un qui n'a jamais paye. Les deux se terminent par une coupure,
-- mais ni le message, ni la duree, ni la suite ne sont les memes — les
-- confondre dans une colonne unique rendrait impossible de distinguer « votre
-- carte a ete refusee » de « votre essai est termine ».
--
-- NULL = pas d'essai en cours. C'est le cas de tout compte cree avant cette
-- migration, et de tout compte devenu payant.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN companies.trial_ends_at IS
    'Fin de l''essai gratuit. NULL = aucun essai en cours (jamais commence, ou '
    'deja converti en abonnement). Distinct de grace_period_ends_at, qui couvre '
    'un client payant dont le prelevement a echoue.';

CREATE INDEX IF NOT EXISTS idx_companies_trial_ends_at
    ON companies(trial_ends_at) WHERE trial_ends_at IS NOT NULL;

COMMIT;

-- Verification :
-- SELECT company_name, subscription_status, trial_ends_at FROM companies
--  WHERE trial_ends_at IS NOT NULL ORDER BY trial_ends_at;
