-- 018 — Demandes d'avis envoyées par SMS après une intervention.
--
-- POURQUOI UNE TABLE PLUTÔT QU'UN SIMPLE ENVOI
--
-- Trois choses doivent être tracées, et aucune ne peut l'être sans mémoire :
--
-- 1. **Ne pas redemander au même client.** Un artisan qui intervient trois
--    fois chez la même personne ne doit pas lui envoyer trois SMS. C'est
--    agaçant, c'est du harcèlement au sens commun, et Google considère la
--    sollicitation répétée comme une pratique douteuse.
--
-- 2. **Le désabonnement.** Un client qui répond STOP ne doit plus jamais
--    recevoir de demande, de cet artisan ni d'un autre. Sans registre, la
--    demande repartirait au prochain passage.
--
-- 3. **La preuve de non-sélection.** Google interdit de solliciter
--    sélectivement les clients satisfaits. Le seul moyen de démontrer qu'on
--    envoie à TOUT LE MONDE est de garder la trace de chaque envoi — y compris
--    ceux qui aboutissent à un avis négatif.
--
-- Ce dernier point est ce qui rend la table indispensable au dossier d'accès
-- à l'API Google : sans elle, c'est notre parole contre un soupçon.

BEGIN;

CREATE TABLE IF NOT EXISTS review_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,

    -- E.164, même contrainte que partout ailleurs.
    client_phone      VARCHAR(20) NOT NULL,
    -- Facultatif : sert seulement à personnaliser, jamais à trier.
    client_name       VARCHAR(120),

    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at           TIMESTAMPTZ,
    -- Motif d'échec, conservé : un numéro invalide se corrige, un refus
    -- opérateur se constate.
    failure_reason    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT review_requests_status_check
        CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    CONSTRAINT review_requests_phone_check
        CHECK (client_phone ~ '^\+[1-9][0-9]{6,14}$')
);

CREATE INDEX IF NOT EXISTS idx_review_requests_profile
    ON review_requests (google_profile_id, created_at DESC);
-- Sert au contrôle anti-doublon : « ce numéro a-t-il déjà été sollicité par
-- cette fiche récemment ? »
CREATE INDEX IF NOT EXISTS idx_review_requests_phone
    ON review_requests (google_profile_id, client_phone, created_at DESC);

-- Registre de désabonnement, GLOBAL et non par artisan.
--
-- Un client qui a dit STOP l'a dit à un SMS, pas à une entreprise en
-- particulier. Le limiter à l'artisan qui a envoyé le message obligerait la
-- même personne à répéter STOP à chaque nouvel artisan — ce qui est
-- exactement ce que le désabonnement doit éviter.
CREATE TABLE IF NOT EXISTS sms_optouts (
    phone      VARCHAR(20) PRIMARY KEY,
    reason     VARCHAR(40) NOT NULL DEFAULT 'stop',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sms_optouts_phone_check CHECK (phone ~ '^\+[1-9][0-9]{6,14}$')
);

COMMENT ON TABLE review_requests IS
    'Demandes d''avis envoyees. Trace la NON-SELECTION exigee par Google.';
COMMENT ON TABLE sms_optouts IS
    'Numeros desabonnes. Global : un STOP vaut pour tous les artisans.';

COMMIT;

-- Vérification :
-- SELECT status, count(*) FROM review_requests GROUP BY status;
