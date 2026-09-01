-- 026 — L'essai demarre au rattachement de la fiche, pas a l'inscription.
--
-- POURQUOI
--
-- Un artisan s'inscrit, puis attend que Google accorde l'acces a son API. Tant
-- que sa fiche n'est pas rattachee, il n'a ni avis, ni position, ni rapport :
-- le produit ne fait rien pour lui. Ses quatorze jours s'ecoulent pourtant.
--
-- Constate sur un client reel le 1er septembre 2026 : inscrit le jour meme,
-- essai courant jusqu'au 15, et rien d'utilisable entre-temps.
--
-- POURQUOI UNE COLONNE ET PAS UN SIMPLE RECALCUL
--
-- Sans trace du demarrage, chaque reconnexion de fiche repousserait la fin de
-- l'essai — un artisan pourrait le prolonger indefiniment en debranchant et
-- rebranchant sa fiche. `trial_started_at` ne se pose qu'une fois.
--
-- NULL = essai pas encore demarre. C'est l'etat de tout compte inscrit avant
-- d'avoir rattache sa premiere fiche.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

COMMENT ON COLUMN companies.trial_started_at IS
    'Rattachement de la PREMIERE fiche Google, moment ou l''essai commence '
    'reellement. NULL = pas encore demarre. Ne se pose qu''une fois : sans quoi '
    'une reconnexion de fiche prolongerait l''essai indefiniment.';

COMMIT;

-- Verification :
-- SELECT company_name, subscription_status, trial_started_at, trial_ends_at
--   FROM companies ORDER BY created_at;
