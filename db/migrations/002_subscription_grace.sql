-- =============================================================================
-- Migration 002 — MapArtisans : dates d'abonnement
-- =============================================================================
-- Ajoute les trois dates nécessaires aux écrans de paiement en échec et de
-- résiliation (cahier des charges UI/UX, §06 « États transverses »).
--
-- Sans elles, le bandeau ne peut afficher qu'un « veuillez régulariser » vague,
-- alors que l'écran doit annoncer une échéance concrète (« interruption le
-- 2 septembre ») — c'est ce qui rend l'urgence actionnable pour l'artisan.
--
-- Ces valeurs viennent de Stripe : `payment_failed_at` du premier échec
-- d'invoice, `grace_period_ends_at` de la fin de la relance automatique
-- (smart retries), `canceled_at` de l'événement customer.subscription.deleted.
--
-- Migration additive et rejouable, applicable sans interruption de service.
-- =============================================================================

BEGIN;

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS payment_failed_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS canceled_at          TIMESTAMPTZ;

-- Le cron qui coupe le service en fin de délai de grâce ne balaie que les
-- comptes réellement en échec de paiement.
CREATE INDEX IF NOT EXISTS idx_companies_grace_expiring
    ON companies(grace_period_ends_at)
    WHERE subscription_status = 'past_due';

COMMIT;
