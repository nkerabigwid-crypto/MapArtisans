#!/usr/bin/env bash
#
# Retire le rôle d'administrateur.
#
#   ./db/retirer-admin.sh ancien@exemple.ch
#
# Le pendant de promouvoir-admin.sh. Il existe pour que retirer un accès soit
# aussi simple que l'accorder : un rôle qu'on ne sait pas retirer vite finit
# par ne jamais être retiré.
#
# Le rôle étant relu à chaque requête et non stocké dans le cookie de session,
# le retrait prend effet immédiatement — inutile d'attendre l'expiration du
# jeton de l'intéressé.

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

EMAIL_NORM="$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')"

# Refus de retirer le DERNIER administrateur : sans lui, plus personne ne peut
# ouvrir la console, et il faut repasser par SSH pour s'en rendre compte.
RESTANTS="$("${PSQL[@]}" -c "SELECT count(*) FROM users WHERE role = 'admin' AND lower(email) <> '${EMAIL_NORM//\'/\'\'}';" | tr -d '\r')"
if [ "$RESTANTS" = "0" ]; then
  echo "✗ Refus : « $EMAIL » est le dernier administrateur." >&2
  echo "  Promouvez quelqu'un d'autre avant de retirer ce rôle." >&2
  exit 1
fi

"${PSQL[@]}" -c "UPDATE users SET role = 'artisan' WHERE lower(email) = '${EMAIL_NORM//\'/\'\'}';" >/dev/null
echo "✓ Rôle retiré à « $EMAIL ». Effet immédiat."
