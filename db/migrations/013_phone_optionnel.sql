-- 013 — `users.phone_number` devient optionnel.
--
-- POURQUOI
--
-- Le schéma v1.4 imposait NOT NULL, en supposant que tout compte naît avec un
-- mobile. Le code n'a jamais fonctionné ainsi :
--
--   · `UserRecord.phoneNumber` est déclaré `string | null` ;
--   · `listWeeklyStats` écarte explicitement les fiches sans numéro, pour
--     qu'un artisan sans mobile ne bloque pas la tournée hebdomadaire des
--     autres ;
--   · `createUser(email, password)` ne prend pas de numéro : l'inscription se
--     fait par e-mail et lien magique, le mobile arrive ensuite.
--
-- Conséquence constatée le 30 août 2026, en exerçant le dépôt PostgreSQL contre
-- la vraie base : toute création de compte échouait sur
-- « null value in column "phone_number" violates not-null constraint ».
-- Aucun client n'aurait pu s'inscrire.
--
-- C'est le schéma qui avait tort, pas le code : un numéro de mobile ne peut pas
-- être exigé au moment où l'on ne l'a pas encore demandé.

BEGIN;

ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;

COMMENT ON COLUMN users.phone_number IS
    'E.164, ex. +41791234567. NULL tant que l''artisan ne l''a pas renseigne : '
    'sans numero, il ne recoit simplement pas le rapport SMS hebdomadaire.';

COMMIT;

-- Verification :
-- SELECT count(*) FILTER (WHERE phone_number IS NULL) AS sans_mobile FROM users;
