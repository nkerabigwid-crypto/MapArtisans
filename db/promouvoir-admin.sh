#!/usr/bin/env bash
#
# Promeut un compte existant au rôle d'administrateur.
#
#   ./db/promouvoir-admin.sh vous@exemple.ch
#
# POURQUOI UN SCRIPT ET PAS UN ÉCRAN
#
# Une page « promouvoir un utilisateur » est une cible : elle transforme la
# compromission d'un compte quelconque en compromission totale. Le rôle se
# donne depuis le serveur, par quelqu'un qui a déjà l'accès SSH — c'est-à-dire
# quelqu'un qui pourrait de toute façon tout lire.
#
# Le compte doit EXISTER : on ne crée pas d'administrateur par ce script.
# Inscrivez-vous normalement sur le site, puis promouvez ce compte. Un compte
# créé en base sans passer par l'inscription n'aurait pas de mot de passe
# haché correctement et ne pourrait pas se connecter.

set -euo pipefail

EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  echo "Usage : $0 <email>" >&2
  exit 1
fi

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE/deploy"

PSQL=(docker compose --env-file .env.production exec -T postgres
      psql -U "${POSTGRES_USER:-mapartisans}" -d "${POSTGRES_DB:-mapartisans}" -tA)

# L'adresse est normalisée comme à l'inscription : sans cela, « Vous@ex.ch »
# ne correspondrait à rien et le script signalerait un compte introuvable.
EMAIL_NORM="$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')"

EXISTE="$("${PSQL[@]}" -c "SELECT count(*) FROM users WHERE lower(email) = '${EMAIL_NORM//\'/\'\'}';" | tr -d '\r')"

if [ "$EXISTE" = "0" ]; then
  echo "✗ Aucun compte pour « $EMAIL »." >&2
  echo "  Inscrivez-vous d'abord sur https://mapartisans.com, puis relancez." >&2
  exit 1
fi

"${PSQL[@]}" -c "UPDATE users SET role = 'admin' WHERE lower(email) = '${EMAIL_NORM//\'/\'\'}';" >/dev/null

echo "✓ « $EMAIL » est administrateur."
echo "  Console : https://mapartisans.com/admin"
echo
echo "Administrateurs actuels :"
"${PSQL[@]}" -c "SELECT '  · ' || email FROM users WHERE role = 'admin' ORDER BY email;"
