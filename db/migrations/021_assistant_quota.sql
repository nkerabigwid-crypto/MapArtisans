-- 021 — Compteur quotidien de l'assistant.
--
-- POURQUOI
--
-- `assistant_settings.daily_message_limit` plafonne la depense quotidienne par
-- artisan depuis la migration 016. Mais rien ne comptait les messages : la
-- limite ne pouvait donc pas s'appliquer.
--
-- Le widget est expose sur des sites tiers et appele sans authentification.
-- Sans compteur, une seule page laissee ouverte avec une boucle consomme le
-- budget OpenAI de l'artisan, et la facture arrive avant la detection.
--
-- UNE LIGNE PAR FICHE ET PAR JOUR
--
-- Pas un journal de messages : nous n'avons aucun besoin de conserver le
-- contenu des conversations, et le conserver creerait une obligation de
-- protection des donnees sans contrepartie. Un compteur suffit a plafonner.
--
-- Les lignes anciennes n'ont aucune valeur au-dela du suivi de consommation ;
-- une purge periodique pourra les retirer sans rien casser.

BEGIN;

CREATE TABLE IF NOT EXISTS assistant_usage (
    google_profile_id UUID NOT NULL REFERENCES google_profiles(id) ON DELETE CASCADE,
    -- Jour civil UTC. Le fuseau exact importe peu pour un plafond de cout ;
    -- ce qui compte est que la remise a zero soit previsible.
    jour              DATE NOT NULL,
    messages          INTEGER NOT NULL DEFAULT 0 CHECK (messages >= 0),

    PRIMARY KEY (google_profile_id, jour)
);

COMMENT ON TABLE assistant_usage IS
    'Compteur quotidien par fiche. Sert au plafond de depense, pas a l''analyse. '
    'Aucun contenu de conversation n''est conserve.';

COMMIT;

-- Verification :
-- SELECT google_profile_id, jour, messages FROM assistant_usage ORDER BY jour DESC LIMIT 20;
