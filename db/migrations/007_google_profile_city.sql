-- =============================================================================
-- Migration 007 — MapArtisans : ville de la fiche Google
-- =============================================================================
-- `city` manquait au schéma alors que le code l'utilise déjà : le prompt de
-- génération des réponses aux avis l'injecte pour ancrer le texte localement
-- (lib/server/ai/openai.ts), et le worker la lit à chaque traitement
-- (lib/server/queue/reviewWorker.ts).
--
-- Sans cette colonne, la bascule du dépôt mémoire vers Prisma aurait échoué à
-- l'exécution, pas à la compilation — le genre d'écart qui ne se voit qu'en
-- production.
--
-- La colonne est créée NULLABLE puis renseignée, plutôt que NOT NULL avec une
-- valeur par défaut : une ville par défaut serait fausse pour toutes les
-- fiches existantes, et une donnée fausse est pire qu'une donnée absente.
-- =============================================================================

BEGIN;

ALTER TABLE google_profiles
    ADD COLUMN IF NOT EXISTS city VARCHAR(120);

COMMENT ON COLUMN google_profiles.city IS
    'Ville ou zone d''intervention. Injectée dans le prompt IA pour ancrer localement les réponses aux avis.';

COMMIT;

-- =============================================================================
-- À faire APRÈS migration : renseigner la ville des fiches existantes, puis
-- passer la colonne en NOT NULL une fois qu''aucune ligne n''est vide.
-- =============================================================================
-- SELECT id, business_name FROM google_profiles WHERE city IS NULL;
-- ALTER TABLE google_profiles ALTER COLUMN city SET NOT NULL;
