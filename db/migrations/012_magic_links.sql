-- 012 — Table des liens magiques (connexion sans mot de passe).
--
-- Le code (frontend/lib/server/magicLink.ts) émettait déjà ces jetons, mais
-- aucune table ne les accueillait : la fonctionnalité ne pouvait pas quitter le
-- dépôt en mémoire.
--
-- DEUX CHOIX QUI NE SONT PAS COSMÉTIQUES
--
-- 1. La clé primaire est le HACHÉ du jeton, jamais le jeton. Un lien magique
--    ouvre une session sans rien demander d'autre : stocké en clair, une fuite
--    de base — ou une sauvegarde oubliée — donnerait un accès direct à tous les
--    comptes dont le lien n'a pas expiré.
--
-- 2. `used_at` est nullable et n'est PAS supprimé à la consommation. Conserver
--    la ligne permet de distinguer « jeton inconnu » de « jeton déjà utilisé »,
--    donc d'afficher un message juste — et de repérer un rejeu.

BEGIN;

CREATE TABLE IF NOT EXISTS magic_links (
    token_hash  CHAR(64)     PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Sert au ménage des jetons périmés. Sans index, la purge deviendrait un
-- balayage complet le jour où la table compte des centaines de milliers de
-- lignes — un lien est émis à chaque connexion.
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON magic_links (expires_at);

COMMENT ON COLUMN magic_links.token_hash IS
    'SHA-256 hexadecimal du jeton. Le jeton en clair n''est jamais stocke.';

COMMIT;

-- Menage a prevoir (cron quotidien) :
--   DELETE FROM magic_links WHERE expires_at < now() - interval '7 days';
