-- =============================================================================
-- Migration 001 — MapArtisans v1.3 → v1.4
-- =============================================================================
-- À exécuter sur une base déjà créée avec le schéma v1.3.
-- Pour une base neuve, utiliser directement db/schema-v1.4.sql.
--
-- Cette migration est additive : aucune colonne ni table n'est supprimée,
-- aucune donnée existante n'est réécrite. Elle peut donc être appliquée sans
-- interruption de service.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- companies : métier, pays, devise et montant du plan
-- -----------------------------------------------------------------------------
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS trade_type   VARCHAR(50),
    ADD COLUMN IF NOT EXISTS country      CHAR(2)     NOT NULL DEFAULT 'FR',
    ADD COLUMN IF NOT EXISTS currency     CHAR(3)     NOT NULL DEFAULT 'EUR',
    ADD COLUMN IF NOT EXISTS plan_amount  NUMERIC(8,2);

-- ADD CONSTRAINT n'accepte pas IF NOT EXISTS : on supprime avant d'ajouter pour
-- que la migration reste rejouable.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_country_check;
ALTER TABLE companies
    ADD CONSTRAINT companies_country_check CHECK (country IN ('FR', 'CH'));

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_currency_check;
ALTER TABLE companies
    ADD CONSTRAINT companies_currency_check CHECK (currency IN ('EUR', 'CHF'));

-- v1.3 n'autorisait pas 'trialing' : la contrainte est remplacée, pas ajoutée.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_subscription_status_check;
ALTER TABLE companies
    ADD CONSTRAINT companies_subscription_status_check
        CHECK (subscription_status IN ('incomplete', 'trialing', 'active', 'past_due', 'canceled'));

-- -----------------------------------------------------------------------------
-- rank_trackings : itinéraires générés (affiché à côté des appels)
-- -----------------------------------------------------------------------------
ALTER TABLE rank_trackings
    ADD COLUMN IF NOT EXISTS directions_generated INT NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- posts : tag de thématique, utilisé par la génération IA
-- -----------------------------------------------------------------------------
ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS topic_tag VARCHAR(50);

-- -----------------------------------------------------------------------------
-- Nouvelles tables — voir db/schema-v1.4.sql pour les commentaires détaillés
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qr_codes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    label             VARCHAR(100) NOT NULL,
    code_slug         VARCHAR(120) NOT NULL UNIQUE,
    scans_count       INT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_feedback (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    qr_code_id        UUID REFERENCES qr_codes(id) ON DELETE SET NULL,
    client_name       VARCHAR(255),
    message           TEXT NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMPTZ,

    CONSTRAINT review_feedback_status_check
        CHECK (status IN ('open', 'resolved'))
);

CREATE TABLE IF NOT EXISTS competitor_flags (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    flagged_name      TEXT NOT NULL,
    flagged_place_id  VARCHAR(255),
    reason            VARCHAR(50) NOT NULL,
    status            VARCHAR(30) NOT NULL DEFAULT 'detected',
    detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT competitor_flags_reason_check
        CHECK (reason IN ('keyword_stuffing', 'duplicate', 'fake_address')),
    CONSTRAINT competitor_flags_status_check
        CHECK (status IN ('detected', 'pending_review', 'submitted', 'rejected'))
);

-- -----------------------------------------------------------------------------
-- Index — performance des tâches de fond et du dashboard
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_companies_user_id
    ON companies(user_id);
CREATE INDEX IF NOT EXISTS idx_google_profiles_company_id
    ON google_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_reviews_google_profile_id
    ON reviews(google_profile_id);
CREATE INDEX IF NOT EXISTS idx_reviews_pending
    ON reviews(google_profile_id, review_date DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_posts_google_profile_id
    ON posts(google_profile_id);
CREATE INDEX IF NOT EXISTS idx_posts_due
    ON posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_rank_trackings_google_profile_id
    ON rank_trackings(google_profile_id);
CREATE INDEX IF NOT EXISTS idx_rank_trackings_latest
    ON rank_trackings(google_profile_id, keyword, tracked_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_codes_google_profile_id
    ON qr_codes(google_profile_id);
CREATE INDEX IF NOT EXISTS idx_review_feedback_google_profile_id
    ON review_feedback(google_profile_id);
CREATE INDEX IF NOT EXISTS idx_review_feedback_open
    ON review_feedback(google_profile_id, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_competitor_flags_google_profile_id
    ON competitor_flags(google_profile_id);

COMMIT;
