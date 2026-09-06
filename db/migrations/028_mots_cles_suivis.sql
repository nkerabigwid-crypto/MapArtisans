-- 028 — Les mots-cles dont on suit la position.
--
-- CE QUI MANQUAIT
--
-- `rank_trackings.keyword` enregistre ce QUI A ETE scanne. Rien ne disait ce
-- qu'il FAUT scanner. Le suivi Geo-Grid est vendu dans les trois formules
-- — « 1 mot-cle » en Basique, « 5 » au-dessus — sans qu'aucune table ne
-- porte cette liste.
--
-- POURQUOI UNE TABLE ET PAS UNE COLONNE
--
-- Un tableau dans `google_profiles` aurait suffi a stocker les chaines. Mais
-- il faut aussi savoir QUAND chaque mot-cle a ete releve pour la derniere
-- fois : sans cette date, le planificateur rescanne tout a chaque passage, ou
-- rien du tout. Une ligne par mot-cle permet de suivre chacun separement.
--
-- LE PLAFOND N'EST PAS DANS LE SCHEMA
--
-- 1 mot-cle en Basique, 5 au-dessus : cette regle depend du palier souscrit,
-- qui change au fil de la vie du compte. Une contrainte SQL la figerait au
-- moment de l'insertion et refuserait ensuite une montee en gamme. Elle vit
-- donc dans le code, au plus pres de la decision.

BEGIN;

CREATE TABLE IF NOT EXISTS tracked_keywords (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    keyword           VARCHAR(255) NOT NULL,
    -- Pose par le planificateur apres un relevé reussi. NULL = jamais releve,
    -- donc prioritaire au prochain passage.
    last_scanned_at   TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Un meme mot-cle deux fois sur une fiche doublerait le cout et les
    -- lignes d'historique sans rien apporter.
    CONSTRAINT tracked_keywords_unique UNIQUE (google_profile_id, keyword)
);

COMMENT ON TABLE tracked_keywords IS
    'Mots-cles dont MapArtisans suit la position. Le plafond par palier vit '
    'dans le code : une contrainte SQL refuserait une montee en gamme.';

-- Le planificateur cherche les mots-cles jamais releves ou releves il y a
-- plus d'une semaine. NULLS FIRST : un mot-cle neuf passe avant les autres.
CREATE INDEX IF NOT EXISTS idx_tracked_keywords_a_relever
    ON tracked_keywords(last_scanned_at NULLS FIRST);

COMMIT;

-- Verification :
-- SELECT g.business_name, k.keyword, k.last_scanned_at
--   FROM tracked_keywords k
--   JOIN google_profiles g ON g.id = k.google_profile_id
--  ORDER BY k.last_scanned_at NULLS FIRST;
