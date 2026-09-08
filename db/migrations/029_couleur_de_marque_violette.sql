-- 029 — La couleur de marque par defaut passe au violet.
--
-- CE QUI CLOCHAIT
--
-- La feuille de style est passee du bleu de Prusse #123f6d au violet #7c3aed.
-- Deux colonnes portaient encore l'ancienne teinte comme valeur par defaut :
--
--   agency_settings.primary_color     (008) — la couleur d'une agence en
--                                      marque blanche, injectee en `--accent`
--   assistant_settings.widget_color   (016) — la pastille du widget d'assistance
--
-- Une agence creee sans preciser de couleur heritait donc du bleu, et son
-- espace s'affichait dans une teinte que le produit n'emploie plus nulle part.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
--
-- Elle ne touche AUCUNE ligne existante. Une agence qui porte #123f6d
-- aujourd'hui l'a peut-etre choisi deliberement — rien en base ne distingue un
-- choix d'un heritage silencieux. Repeindre ses ecrans sans le lui demander
-- serait decider a sa place. Seul le defaut des futures lignes change.
--
-- Pour reprendre les lignes restees au bleu, apres accord de l'agence :
--   UPDATE agency_settings SET primary_color = '#7c3aed'
--    WHERE primary_color = '#123f6d';
--
-- La contrainte CHECK ^#[0-9a-fA-F]{6}$ posee en 008 et 016 reste valable :
-- la nouvelle valeur la respecte.

ALTER TABLE agency_settings
    ALTER COLUMN primary_color SET DEFAULT '#7c3aed';

ALTER TABLE assistant_settings
    ALTER COLUMN widget_color SET DEFAULT '#7c3aed';
