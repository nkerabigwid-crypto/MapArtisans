-- 016 — Assistant conversationnel et prise de rendez-vous (palier Complet).
--
-- CE QUI DIFFÉRENCIE CE MODULE DE TOUS LES AUTRES
--
-- Le widget s'exécute sur le site de l'artisan, pas sur le nôtre. Son
-- identifiant est donc LISIBLE dans le code source de n'importe quelle page
-- qui l'affiche. Tout ce qui est accessible avec cet identifiant est, de fait,
-- public : n'importe qui peut le copier et appeler notre API.
--
-- Sans garde-fous, cela revient à publier une clé OpenAI. Trois protections
-- sont donc dans le schéma, pas seulement dans le code :
--
--   · `widget_key` remplace l'identifiant interne de la fiche. Il est
--     révocable : compromis, on le régénère sans toucher au reste.
--   · `allowed_origins` restreint les domaines autorisés à appeler l'API.
--   · `daily_message_limit` plafonne la dépense quotidienne par artisan.

BEGIN;

CREATE TABLE IF NOT EXISTS assistant_settings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id   UUID NOT NULL UNIQUE REFERENCES google_profiles(id) ON DELETE CASCADE,

    -- Clé publique du widget. Distincte de l'identifiant de la fiche : celui-ci
    -- sert aussi ailleurs, et l'exposer sur des sites tiers reviendrait à
    -- publier une référence interne que l'on ne peut plus changer.
    widget_key          VARCHAR(48) NOT NULL UNIQUE,

    -- Domaines autorisés à appeler l'API avec cette clé, séparés par des
    -- virgules. Vide = aucun. On refuse par défaut : un artisan qui n'a pas
    -- déclaré son site ne doit pas voir son budget consommé par un inconnu.
    allowed_origins     TEXT NOT NULL DEFAULT '',

    -- Base de connaissances propre à l'artisan : horaires, zone d'intervention,
    -- tarifs de déplacement. Injectée dans le prompt.
    faq_context         TEXT,

    -- Couleur du widget. Même validation que la marque blanche : #rrggbb
    -- uniquement, car elle finit dans une feuille de style.
    widget_color        VARCHAR(7) NOT NULL DEFAULT '#123f6d',

    -- Plafond de messages par jour. Au-delà, le widget répond poliment qu'il
    -- est indisponible plutôt que de continuer à facturer.
    daily_message_limit INTEGER NOT NULL DEFAULT 200,

    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT assistant_color_check CHECK (widget_color ~ '^#[0-9a-fA-F]{6}$'),
    CONSTRAINT assistant_limit_check CHECK (daily_message_limit BETWEEN 0 AND 5000)
);

CREATE TABLE IF NOT EXISTS appointments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    client_name       VARCHAR(120) NOT NULL,
    -- E.164. C'est par là que l'artisan rappellera : un format libre rendrait
    -- la moitié des numéros inutilisables.
    client_phone      VARCHAR(20) NOT NULL,
    client_email      VARCHAR(255),
    requested_at      TIMESTAMPTZ NOT NULL,
    details           TEXT,
    status            VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT appointments_status_check CHECK (status IN ('confirmed', 'canceled', 'honored')),
    CONSTRAINT appointments_phone_check CHECK (client_phone ~ '^\+[1-9][0-9]{6,14}$')
);

CREATE INDEX IF NOT EXISTS idx_appointments_profile ON appointments (google_profile_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_widget_key ON assistant_settings (widget_key);

COMMENT ON COLUMN assistant_settings.widget_key IS
    'Cle publique, visible dans le code source des sites clients. Revocable.';
COMMENT ON COLUMN assistant_settings.allowed_origins IS
    'Domaines autorises, separes par des virgules. Vide = aucun appel accepte.';

COMMIT;

-- Vérification :
-- SELECT count(*) FROM assistant_settings; SELECT count(*) FROM appointments;
