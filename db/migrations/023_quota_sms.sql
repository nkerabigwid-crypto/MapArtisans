-- 023 — Compteur mensuel de SMS.
--
-- POURQUOI
--
-- Le SMS est le seul cout variable non borne du produit. Un SMS suisse revient
-- a 5-10 centimes, soit dix a cinquante fois une reponse generee par l'IA —
-- dont la depense est deja plafonnee par max_tokens et par le quota quotidien
-- de l'assistant.
--
-- Sans borne, un artisan tres actif peut envoyer plusieurs centaines de
-- demandes d'avis par mois. La facture Twilio arrive apres coup et rien ne
-- l'annonce : c'est le mode de panne qu'on veut eviter.
--
-- UNE LIGNE PAR ENTREPRISE ET PAR MOIS
--
-- Le compteur porte sur l'ENTREPRISE et non sur la fiche : le plafond decoule
-- du palier souscrit, qui est un attribut du compte. Une agence detenant
-- plusieurs fiches consomme un seul plafond, ce qui est le comportement voulu —
-- sinon le plafond se multiplierait avec le nombre de fiches.
--
-- Le premier jour du mois sert de cle. La remise a zero est donc implicite :
-- une nouvelle ligne apparait, aucune tache de purge n'est necessaire.

BEGIN;

CREATE TABLE IF NOT EXISTS sms_usage (
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    -- Premier jour du mois concerne, en UTC.
    mois       DATE NOT NULL,
    envoyes    INTEGER NOT NULL DEFAULT 0 CHECK (envoyes >= 0),

    PRIMARY KEY (company_id, mois)
);

COMMENT ON TABLE sms_usage IS
    'Compteur mensuel de SMS par entreprise. Sert au plafond de depense. '
    'Le rapport hebdomadaire y est compte mais n''est jamais bloque.';

COMMIT;

-- Verification :
-- SELECT company_id, mois, envoyes FROM sms_usage ORDER BY mois DESC, envoyes DESC;
