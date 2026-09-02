#!/usr/bin/env bash
#
# Qui est en période d'essai, et combien de jours reste-t-il.
#
#   ./db/lister-essais.sh
#
# POURQUOI PAS DANS LA CONSOLE /admin
#
# La console ne montre que des agrégats : elle dit COMBIEN d'essais sont en
# cours, jamais QUI. Une page web qui déverse noms et adresses devient, le jour
# d'une intrusion, la fuite elle-même. Ce script demande un accès SSH — donc
# quelqu'un qui pourrait de toute façon tout lire.
#
# CE QUE LA COLONNE « reste » VEUT DIRE
#
# L'essai ne démarre pas à l'inscription mais au rattachement de la fiche
# Google. Un compte inscrit dont la fiche n'est pas branchée n'a pas de
# trial_ends_at : il apparaît en bas, sous « en attente de fiche », et ne
# consomme aucun jour. C'est voulu — personne ne doit brûler son essai pendant
# que Google valide notre accès à l'API.

set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE/deploy"

PSQL=(docker compose --env-file .env.production exec -T postgres
      psql -U "${POSTGRES_USER:-mapartisans}" -d "${POSTGRES_DB:-mapartisans}")

echo "Essais en cours"
echo
# Tri par échéance : celui qui expire en premier est celui qu'il faut appeler
# en premier. `rappel` dit si le SMS de la veille est deja parti — sans cette
# colonne, on ne sait pas si le silence du client vaut refus ou oubli.
"${PSQL[@]}" -c "
  SELECT c.company_name        AS entreprise,
         u.email,
         to_char(c.trial_ends_at, 'DD.MM  HH24:MI') AS fin_essai,
         GREATEST(0, date_part('day', c.trial_ends_at - now()))::int AS jours_restants,
         CASE WHEN c.trial_reminder_sent_at IS NULL THEN 'non' ELSE 'oui' END AS rappel,
         CASE WHEN g.id IS NULL THEN 'non' ELSE 'oui' END AS fiche
  FROM companies c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN google_profiles g ON g.company_id = c.id
  WHERE c.subscription_status = 'trialing'
    AND c.trial_ends_at IS NOT NULL
    AND c.trial_ends_at > now()
  ORDER BY c.trial_ends_at;"

echo
echo "Essais expires, non convertis  — a rappeler"
echo
"${PSQL[@]}" -c "
  SELECT c.company_name AS entreprise,
         u.email,
         to_char(c.trial_ends_at, 'DD.MM.YYYY') AS expire_le
  FROM companies c
  JOIN users u ON u.id = c.user_id
  WHERE c.subscription_status = 'trialing'
    AND c.trial_ends_at IS NOT NULL
    AND c.trial_ends_at <= now()
  ORDER BY c.trial_ends_at;"

echo
echo "Inscrits en attente de fiche  — l'essai n'a pas encore demarre"
echo
"${PSQL[@]}" -c "
  SELECT c.company_name AS entreprise,
         u.email,
         to_char(c.created_at, 'DD.MM.YYYY') AS inscrit_le
  FROM companies c
  JOIN users u ON u.id = c.user_id
  WHERE c.trial_ends_at IS NULL
    AND c.subscription_status NOT IN ('active', 'past_due', 'canceled')
  ORDER BY c.created_at;"
