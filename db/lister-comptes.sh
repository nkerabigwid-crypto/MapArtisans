#!/usr/bin/env bash
#
# Liste les comptes et leur rôle.
#
#   ./db/lister-comptes.sh
#
# POURQUOI CE SCRIPT EXISTE
#
# La console /admin renvoie un 404 à qui n'est pas administrateur — donc elle
# ne peut pas, par construction, servir à comprendre POURQUOI on n'y entre
# pas. Sans ce script, la seule réponse au 404 est de deviner.
#
# Lecture seule, et depuis le serveur uniquement : c'est le pendant de
# promouvoir-admin.sh, réservé à qui a déjà l'accès SSH — c'est-à-dire à
# quelqu'un qui pourrait de toute façon tout lire.

set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE/deploy"

PSQL=(docker compose --env-file .env.production exec -T postgres
      psql -U "${POSTGRES_USER:-mapartisans}" -d "${POSTGRES_DB:-mapartisans}")

# `role` d'abord : c'est la colonne qu'on vient lire. Les administrateurs
# remontent en tête pour qu'un compte oublié saute aux yeux.
"${PSQL[@]}" -c "
  SELECT email,
         COALESCE(role, 'utilisateur') AS role,
         to_char(created_at, 'DD.MM.YYYY') AS inscrit_le
  FROM users
  ORDER BY (role = 'admin') DESC, created_at;"
