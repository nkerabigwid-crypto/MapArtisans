-- 014 — Suppression de la table `review_feedback`.
--
-- POURQUOI
--
-- Elle stockait les messages du « formulaire de réclamation privée » : la page
-- qui devait s'ouvrir à la place du lien Google quand un client s'apprêtait à
-- mettre moins de quatre étoiles.
--
-- Cette mécanique porte un nom, le review gating, et Google l'interdit
-- explicitement : « Discourage or prohibit negative reviews, or selectively
-- solicit positive reviews from customers ». La sanction frappe la fiche de
-- l'artisan client, pas l'éditeur.
--
-- L'interface a été retirée le 29 août 2026, la description commerciale le 30.
-- La table restait, vide, et n'était plus référencée par aucune ligne de code.
-- La garder invite à réimplémenter la fonctionnalité un jour où personne ne se
-- souviendra pourquoi elle avait disparu.
--
-- SÉCURITÉ DE L'OPÉRATION
--
-- Vérifié avant exécution : la table contient 0 ligne. Aucune donnée client
-- n'existe à ce jour. Le `IF EXISTS` rend la migration rejouable.
--
-- Ce qui reste en place et ne doit PAS être confondu avec cette suppression :
-- `qr_codes` est conservée. Le QR code de collecte d'avis est légitime — il
-- mène tous les clients au formulaire Google, sans tri.

BEGIN;

DROP TABLE IF EXISTS review_feedback;

COMMIT;

-- Vérification :
-- SELECT to_regclass('public.review_feedback');  -- doit renvoyer NULL
