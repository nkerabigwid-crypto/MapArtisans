-- 020 — Emission des factures.
--
-- POURQUOI
--
-- Le module de generation PDF existait, testé, et n'etait appele par personne :
-- un client qui payait ne recevait aucune facture. En Suisse, la facture n'est
-- pas une courtoisie — c'est la piece comptable que le client doit produire, et
-- que le CO impose de conserver dix ans (art. 958f).
--
-- DEUX TABLES, ET POURQUOI DEUX
--
-- `invoice_counters` porte la sequence par annee. Elle est separee des factures
-- pour que l'attribution du numero soit UNE ecriture atomique : deux paiements
-- simultanes ne doivent jamais obtenir le meme numero, et un SELECT max()+1
-- suivi d'un INSERT le permettrait. Le UPSERT ci-dessous serialise sur la
-- cle primaire.
--
-- `invoices` conserve ce qui a ete facture, pas de quoi le recalculer : le prix
-- d'un plan changera, la raison sociale de l'editeur aussi. Une facture emise
-- est figee. La recalculer a partir des donnees courantes produirait, des le
-- premier changement de tarif, un document different de celui que le client
-- detient.

BEGIN;

CREATE TABLE IF NOT EXISTS invoice_counters (
    annee   INTEGER PRIMARY KEY,
    dernier INTEGER NOT NULL CHECK (dernier >= 1)
);

CREATE TABLE IF NOT EXISTS invoices (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Format FA-2026-0001, unique : c'est la continuite de la serie qu'un
    -- fiduciaire verifie en premier.
    numero            VARCHAR(20) NOT NULL UNIQUE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Identite du client FIGEE au moment de l'emission.
    client_nom        VARCHAR(255) NOT NULL,
    client_email      VARCHAR(255),

    designation       TEXT NOT NULL,
    montant_centimes  INTEGER NOT NULL CHECK (montant_centimes >= 0),
    devise            CHAR(3) NOT NULL DEFAULT 'CHF',

    -- NULL = emetteur non assujetti a la TVA. Renseigne, c'est l'IDE en vigueur
    -- au moment de l'emission, et non celui d'aujourd'hui.
    tva_ide           VARCHAR(20),

    emise_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
    payee_le          TIMESTAMPTZ,
    -- Horodatage de l'envoi au client. NULL = facture emise mais non transmise,
    -- etat qu'il faut pouvoir retrouver pour renvoyer.
    envoyee_le        TIMESTAMPTZ,

    -- Idempotence : un webhook Stripe rejoue ne doit pas emettre deux factures
    -- pour un meme paiement. La contrainte le rend impossible, sans dependre du
    -- verrou applicatif.
    stripe_session_id VARCHAR(255) UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_emise_le ON invoices(emise_le);

COMMENT ON TABLE invoices IS
    'Factures emises. Contenu FIGE : une facture ne se recalcule pas, elle se relit.';
COMMENT ON COLUMN invoices.tva_ide IS
    'IDE en vigueur a l''emission. NULL si non assujetti. Ne jamais retro-remplir.';

COMMIT;

-- Verification :
-- SELECT numero, montant_centimes, emise_le, envoyee_le FROM invoices ORDER BY numero;
