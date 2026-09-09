-- 030 — Les posts video generes pour la fiche Google.
--
-- CE QUE CETTE TABLE PROTEGE
--
-- Une video coute de l'argent : 2,25 $ en 720p pour quinze secondes. Tout ce
-- qui suit existe pour qu'aucune ne soit produite deux fois.
--
-- LA CONTRAINTE QUI COMPTE : (google_profile_id, period_key)
--
-- `period_key` est la periode facturable — « 2026-09 » pour une cadence
-- mensuelle, « 2026-W37 » pour une hebdomadaire. L'unicite garantit qu'un
-- artisan ne recoit qu'une video par periode, MEME SI le planificateur est
-- relance apres un incident, MEME SI deux instances tournent en parallele le
-- temps d'un deploiement.
--
-- C'est la meme precaution que le jobId par semaine ISO de reportQueue.ts,
-- mais posee un cran plus bas : un SMS envoye deux fois est genant, une video
-- generee deux fois est facturee deux fois. Redis peut perdre son etat ; la
-- base, non. La deduplication appartient donc ici.
--
-- POURQUOI LA LIGNE EST CREEE AVANT LA GENERATION
--
-- Le worker insere en `pending` PUIS appelle fal.ai. Dans l'ordre inverse, un
-- redemarrage entre l'appel et l'ecriture perdrait la trace d'une video deja
-- payee — et le passage suivant la regenererait. Mieux vaut une ligne orpheline
-- en `pending` qu'une facture en double.
--
-- POURQUOI video_url N'EST PAS UNE ARCHIVE
--
-- Les URL de fal.ai expirent. Cette colonne sert a publier, pas a conserver :
-- une fois la publication sur la fiche Google branchee, c'est Google qui heberge
-- le media. Tant que l'acces a l'API n'est pas accorde, une video non publiee
-- avant expiration est perdue — d'ou l'interet de ne pas generer en avance.

CREATE TABLE IF NOT EXISTS video_posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,

    -- Periode facturable : « 2026-09 » ou « 2026-W37 ». Voir plus haut.
    period_key        VARCHAR(12) NOT NULL,

    -- Le fichier de public/personnages/. Conserve pour que le visage reste le
    -- meme d'un mois sur l'autre sans dependre du recalcul.
    personnage        VARCHAR(20),
    -- Le texte prononce. Conserve pour l'assistance : quand un artisan
    -- s'etonne de ce que dit sa video, il faut pouvoir le relire.
    script            TEXT,
    -- URL fal.ai, temporaire. Ce n'est pas une archive : voir plus haut.
    video_url         TEXT,

    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- Cout reel en dollars, a six decimales : la voix se compte en millemes.
    -- Un cout qu'on n'enregistre pas est un cout qu'on ne surveille pas.
    cost_usd          NUMERIC(10, 6),

    generated_at      TIMESTAMPTZ,
    published_at      TIMESTAMPTZ,
    -- Motif d'echec conserve : un refus de fal.ai se corrige, un quota epuise
    -- se constate.
    failure_reason    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT video_posts_status_check
        CHECK (status IN ('pending', 'generated', 'published', 'failed')),
    -- LA contrainte. Voir l'en-tete.
    CONSTRAINT video_posts_periode_unique
        UNIQUE (google_profile_id, period_key)
);

-- Le worker cherche « ce qui est genere et pas encore publie ». Sans cet
-- index, il balaie toute la table a chaque passage.
CREATE INDEX IF NOT EXISTS video_posts_a_publier_idx
    ON video_posts (status, generated_at)
    WHERE status = 'generated';
