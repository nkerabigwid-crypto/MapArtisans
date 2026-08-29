-- =============================================================================
-- Migration 008 — MapArtisans : marque blanche pour les agences
-- =============================================================================
-- Une agence web revend MapArtisans à ses clients TPE sous sa propre marque :
-- son domaine, son logo, ses couleurs. L'artisan qui se connecte ne voit jamais
-- notre nom.
--
-- POURQUOI UNE TABLE DÉDIÉE, ET PAS DES COLONNES SUR `companies`
--
-- `companies` est l'entreprise de l'artisan (« Dupont Plomberie »), et une
-- agence en gère plusieurs. Poser `custom_domain` sur `companies` donnerait un
-- domaine PAR ARTISAN — l'inverse du besoin. Les réglages appartiennent à
-- l'utilisateur de rôle `agency`, d'où la clé étrangère vers `users`.
--
-- SÉCURITÉ — ces réglages ne pilotent QUE l'apparence. Le domaine provient de
-- l'en-tête HTTP `Host`, falsifiable par n'importe quel client : l'utiliser
-- pour décider de ce qu'un utilisateur a le droit de voir permettrait une
-- élévation de privilège par simple `curl -H "Host: ..."`. Les autorisations
-- restent portées par la session et le filtre par propriétaire.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS agency_settings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- UNIQUE : une agence n'a qu'un jeu de réglages.
    user_id       UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    -- 253 caractères : longueur maximale d'un nom de domaine (RFC 1035).
    custom_domain VARCHAR(253) UNIQUE,
    brand_name    VARCHAR(120),
    logo_url      TEXT,
    -- #RRGGBB uniquement. La contrainte double la validation applicative :
    -- une valeur libre finirait dans une variable CSS, donc en injection CSS.
    primary_color VARCHAR(7) NOT NULL DEFAULT '#123f6d',
    support_email VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT agency_settings_color_check
        CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
    -- Le domaine est stocké normalisé : minuscules, sans port ni protocole.
    -- Sans cette contrainte, « SEO.Agence.CH » et « seo.agence.ch » seraient
    -- deux lignes distinctes, et la recherche par Host échouerait au hasard.
    CONSTRAINT agency_settings_domain_check
        CHECK (custom_domain IS NULL OR custom_domain = lower(custom_domain))
);

-- La résolution par domaine est faite à CHAQUE requête entrante : c'est le
-- chemin le plus chaud de l'application.
CREATE INDEX IF NOT EXISTS idx_agency_settings_domain
    ON agency_settings(custom_domain)
    WHERE custom_domain IS NOT NULL;

COMMIT;

-- =============================================================================
-- Contrôle : seuls les comptes de rôle `agency` devraient avoir des réglages.
-- Non imposé par une contrainte — le rôle peut changer et invaliderait alors
-- des lignes existantes — mais à surveiller.
-- =============================================================================
-- SELECT a.id, u.email, u.role
-- FROM agency_settings a JOIN users u ON u.id = a.user_id
-- WHERE u.role <> 'agency';
