-- 017 — Journal des événements Stripe.
--
-- POURQUOI CETTE TABLE EXISTE
--
-- Stripe rejoue un webhook jusqu'à trois jours tant qu'il ne reçoit pas de
-- 200. Une coupure réseau d'une seconde suffit à déclencher un renvoi. Sans
-- trace de ce qui a déjà été traité, le même paiement provisionnerait deux
-- fois : deux abonnements activés, deux e-mails de bienvenue, deux factures.
--
-- La clé primaire est l'identifiant d'événement fourni par Stripe. L'insertion
-- fait donc office de verrou : si elle échoue en conflit, c'est que
-- l'événement a déjà été traité, et il n'y a rien à faire.

BEGIN;

CREATE TABLE IF NOT EXISTS stripe_events (
    id           VARCHAR(64) PRIMARY KEY,
    type         VARCHAR(80) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sert au ménage : les événements de plus de trente jours ne peuvent plus être
-- rejoués par Stripe, la ligne devient inutile.
CREATE INDEX IF NOT EXISTS idx_stripe_events_date ON stripe_events (processed_at);

COMMENT ON TABLE stripe_events IS
    'Evenements Stripe deja traites. Empeche le double provisionnement lors des rejeux.';

COMMIT;

-- Menage a prevoir :
--   DELETE FROM stripe_events WHERE processed_at < now() - interval '30 days';
