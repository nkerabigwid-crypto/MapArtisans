-- =============================================================================
-- MapArtisans — schéma PostgreSQL v1.4
-- =============================================================================
-- Évolution du schéma v1.3. Trois tables et quatre colonnes ont été ajoutées
-- pour couvrir des écrans du prototype frontend qui n'avaient pas de source de
-- données (voir le cahier des charges UI/UX, §08 « Écarts »).
--
-- Ajouts par rapport à v1.3 :
--   · companies       → trade_type, country, currency, plan_amount
--   · qr_codes        (nouvelle) — écran Clients
--   · review_feedback (nouvelle) — écran Clients
--   · competitor_flags(nouvelle) — écran Réglages › Avancé
--   · rank_trackings  → directions_generated
--
-- Convention : UUID en clé primaire, timestamps en TIMESTAMPTZ, suppression en
-- cascade depuis le propriétaire (un compte supprimé emporte ses données).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- pour gen_random_uuid()

-- -----------------------------------------------------------------------------
-- 1. users — comptes clients (artisan ou agence)
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    first_name     VARCHAR(100),
    last_name      VARCHAR(100),
    phone_number   VARCHAR(20)  NOT NULL,      -- rapport SMS hebdomadaire
    role           VARCHAR(20)  NOT NULL DEFAULT 'artisan',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT users_role_check
        CHECK (role IN ('artisan', 'agency', 'admin'))
);

-- -----------------------------------------------------------------------------
-- 2. companies — entreprise, abonnement et facturation
-- -----------------------------------------------------------------------------
-- v1.4 : trade_type / country / currency / plan_amount ajoutés. Le prototype
-- les consomme pour le libellé d'abonnement (« 49 € / mois », « 69 CHF / mois »)
-- et pour adapter le vocabulaire des posts IA au métier de l'artisan.
CREATE TABLE companies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name        VARCHAR(255) NOT NULL,
    trade_type          VARCHAR(50),                       -- 'plombier', 'electricien', …
    country             CHAR(2)      NOT NULL DEFAULT 'FR',
    currency            CHAR(3)      NOT NULL DEFAULT 'EUR',
    plan_amount         NUMERIC(8,2),                      -- montant mensuel dans `currency`
    stripe_customer_id  VARCHAR(255),
    subscription_status VARCHAR(50)  NOT NULL DEFAULT 'incomplete',
    -- Dates issues de Stripe, affichées par le bandeau `past_due` et l'écran de
    -- résiliation : sans elles, l'UI ne peut annoncer aucune échéance concrète.
    payment_failed_at    TIMESTAMPTZ,
    grace_period_ends_at TIMESTAMPTZ,
    canceled_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT companies_country_check
        CHECK (country IN ('FR', 'CH')),
    CONSTRAINT companies_currency_check
        CHECK (currency IN ('EUR', 'CHF')),
    CONSTRAINT companies_subscription_status_check
        CHECK (subscription_status IN ('incomplete', 'trialing', 'active', 'past_due', 'canceled'))
);

CREATE INDEX idx_companies_user_id ON companies(user_id);
-- Le cron qui coupe le service en fin de délai de grâce ne balaie que les
-- comptes réellement en échec de paiement.
CREATE INDEX idx_companies_grace_expiring
    ON companies(grace_period_ends_at)
    WHERE subscription_status = 'past_due';

-- -----------------------------------------------------------------------------
-- 3. google_profiles — fiche Google Business Profile synchronisée
-- -----------------------------------------------------------------------------
-- SÉCURITÉ : google_access_token et google_refresh_token doivent être chiffrés
-- applicativement (AES-256-GCM) AVANT insertion. Ne jamais les stocker en clair —
-- une fuite de la base donnerait le contrôle des fiches Google de tous les clients.
CREATE TABLE google_profiles (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    google_location_id    VARCHAR(255) NOT NULL UNIQUE,
    business_name         VARCHAR(255) NOT NULL,
    address               TEXT,
    latitude              DECIMAL(10, 8) NOT NULL,         -- centre de la Geo-Grid
    longitude             DECIMAL(11, 8) NOT NULL,
    google_access_token   TEXT,                            -- chiffré (AES-256-GCM)
    google_refresh_token  TEXT,                            -- chiffré (AES-256-GCM)
    ai_auto_reply         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_google_profiles_company_id ON google_profiles(company_id);

-- -----------------------------------------------------------------------------
-- 4. reviews — avis Google et réponses générées par l'IA
-- -----------------------------------------------------------------------------
CREATE TABLE reviews (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    google_review_id  VARCHAR(255) NOT NULL UNIQUE,
    reviewer_name     VARCHAR(255),
    rating            SMALLINT NOT NULL,
    comment           TEXT,
    ai_reply_draft    TEXT,                                -- brouillon proposé à l'artisan
    reply_text        TEXT,                                -- réponse réellement publiée
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    review_date       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reviews_rating_check
        CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT reviews_status_check
        CHECK (status IN ('pending', 'approved', 'failed'))
);

CREATE INDEX idx_reviews_google_profile_id ON reviews(google_profile_id);
-- Index partiel : les cron jobs ne cherchent que les avis en attente.
CREATE INDEX idx_reviews_pending
    ON reviews(google_profile_id, review_date DESC)
    WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- 5. posts — calendrier éditorial des publications locales
-- -----------------------------------------------------------------------------
CREATE TABLE posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    content           TEXT NOT NULL,
    topic_tag         VARCHAR(50),                         -- 'saison_hiver', 'urgence_weekend', …
    image_url         TEXT,
    scheduled_at      TIMESTAMPTZ NOT NULL,
    status            VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT posts_status_check
        CHECK (status IN ('draft', 'scheduled', 'published', 'failed'))
);

CREATE INDEX idx_posts_google_profile_id ON posts(google_profile_id);
-- Index partiel : le cron de publication ne lit que ce qui est planifié.
CREATE INDEX idx_posts_due
    ON posts(scheduled_at)
    WHERE status = 'scheduled';

-- -----------------------------------------------------------------------------
-- 6. rank_trackings — historique Geo-Grid et preuve de valeur
-- -----------------------------------------------------------------------------
-- v1.4 : directions_generated ajouté (affiché à côté de calls_generated sur
-- l'écran Accueil, « Cette semaine »).
--
-- grid_points réunit chaque point de la grille dans un seul objet :
--   [{"label":"A1","area":"Préfecture","lat":45.764,"lng":4.845,
--     "position":1,"top_competitor":null}, …]
--   · position = null → fiche introuvable dans les résultats
--   · top_competitor = null → l'artisan est lui-même 1er à ce point
--
-- Le statut visuel est dérivé côté application (lib/data.ts, getGridStatus) :
--   1 → vert profond · 2-3 → vert · 4-10 → ambre · > 10 ou null → rouge.
-- Le seuil de 3 vient du Local Pack de Google Maps, qui n'affiche que trois
-- résultats sans interaction supplémentaire de l'utilisateur.
CREATE TABLE rank_trackings (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id     UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    keyword               VARCHAR(255) NOT NULL,
    grid_points           JSONB NOT NULL,
    calls_generated       INT NOT NULL DEFAULT 0,
    directions_generated  INT NOT NULL DEFAULT 0,
    tracked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rank_trackings_google_profile_id ON rank_trackings(google_profile_id);
-- Le dashboard lit systématiquement le scan le plus récent par mot-clé.
CREATE INDEX idx_rank_trackings_latest
    ON rank_trackings(google_profile_id, keyword, tracked_at DESC);

-- =============================================================================
-- NOUVEAU EN v1.4
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7. qr_codes — QR d'avis (camionnette, comptoir, facture…)
-- -----------------------------------------------------------------------------
-- Alimente l'écran Clients. Le code_slug résout vers l'URL publique du
-- formulaire de tri : client satisfait → avis Google, client mécontent →
-- réclamation privée enregistrée dans review_feedback.
CREATE TABLE qr_codes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    label             VARCHAR(100) NOT NULL,               -- 'Camionnette', 'Comptoir', …
    code_slug         VARCHAR(120) NOT NULL UNIQUE,        -- segment d'URL publique
    scans_count       INT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qr_codes_google_profile_id ON qr_codes(google_profile_id);

-- -----------------------------------------------------------------------------
-- 8. review_feedback — réclamations privées (jamais publiées sur Google)
-- -----------------------------------------------------------------------------
-- Distincte de `reviews` : ce contenu ne quitte jamais MapArtisans. C'est le
-- canal qui capte l'insatisfaction avant qu'elle n'atteigne la note publique.
CREATE TABLE review_feedback (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    qr_code_id        UUID REFERENCES qr_codes(id) ON DELETE SET NULL,  -- QR d'origine, si connu
    client_name       VARCHAR(255),                        -- souvent anonyme
    message           TEXT NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMPTZ,

    CONSTRAINT review_feedback_status_check
        CHECK (status IN ('open', 'resolved'))
);

CREATE INDEX idx_review_feedback_google_profile_id ON review_feedback(google_profile_id);
-- Le badge de l'écran Clients ne compte que les réclamations ouvertes.
CREATE INDEX idx_review_feedback_open
    ON review_feedback(google_profile_id, created_at DESC)
    WHERE status = 'open';

-- -----------------------------------------------------------------------------
-- 9. competitor_flags — veille sur les fiches concurrentes suspectes
-- -----------------------------------------------------------------------------
-- Alimente Réglages › Avancé. Volontairement en retrait dans l'UI : c'est un
-- outil de signalement, pas une fonctionnalité quotidienne.
CREATE TABLE competitor_flags (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    flagged_name      TEXT NOT NULL,                       -- nom de la fiche suspecte
    flagged_place_id  VARCHAR(255),                        -- place_id Google, si résolu
    reason            VARCHAR(50) NOT NULL,
    status            VARCHAR(30) NOT NULL DEFAULT 'detected',
    detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT competitor_flags_reason_check
        CHECK (reason IN ('keyword_stuffing', 'duplicate', 'fake_address')),
    CONSTRAINT competitor_flags_status_check
        CHECK (status IN ('detected', 'pending_review', 'submitted', 'rejected'))
);

CREATE INDEX idx_competitor_flags_google_profile_id ON competitor_flags(google_profile_id);
