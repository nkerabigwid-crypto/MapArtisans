#!/usr/bin/env bash
#
# MapArtisans — application des migrations SQL.
#
# Usage (depuis la racine, sur le serveur) :
#   ./db/migrate.sh                 applique ce qui manque
#   ./db/migrate.sh --etat          liste seulement, sans rien appliquer
#
# POURQUOI UN SCRIPT PLUTOT QUE `prisma migrate`
#
# Les migrations sont ecrites a la main, en SQL, et commentees : elles portent
# le POURQUOI de chaque changement, ce qu'un generateur ne sait pas produire.
# Prisma sert de reference au modele, pas d'outil de migration.
#
# GARANTIES
#
# · Chaque fichier n'est applique QU'UNE FOIS (table schema_migrations).
# · Chaque fichier s'applique dans SA PROPRE transaction : une migration qui
#   echoue ne laisse pas la base a moitie migree.
# · Le script est rejouable sans risque : relancer ne fait rien de plus.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTENEUR="${PG_CONTENEUR:-mapartisans-postgres-1}"
BASE="${POSTGRES_DB:-mapartisans}"
UTILISATEUR="${POSTGRES_USER:-mapartisans}"
ETAT_SEUL=0
[ "${1:-}" = "--etat" ] && ETAT_SEUL=1

psql_() { docker exec -i "$CONTENEUR" psql -v ON_ERROR_STOP=1 -U "$UTILISATEUR" -d "$BASE" "$@"; }

# Journal des migrations. Cree en premier : sans lui, impossible de savoir ce
# qui a deja tourne, et rejouer une migration destructrice serait catastrophique.
psql_ -q -c "CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);" >/dev/null

deja_applique() {
    [ "$(psql_ -tAc "SELECT 1 FROM schema_migrations WHERE version = '$1';")" = "1" ]
}

appliquer() {
    local version="$1" fichier="$2"
    if deja_applique "$version"; then
        echo "  = $version (deja applique)"
        return
    fi
    if [ "$ETAT_SEUL" -eq 1 ]; then
        echo "  ! $version (A APPLIQUER)"
        return
    fi
    echo "  + $version"
    # BEGIN/COMMIT explicites autour du fichier : plusieurs migrations ouvrent
    # deja leur propre transaction, et psql tolere l'imbrication en emettant un
    # avertissement plutot qu'une erreur. L'important est qu'un echec quelconque
    # ramene la base a son etat d'avant.
    {
        echo "BEGIN;"
        cat "$fichier"
        echo "INSERT INTO schema_migrations (version) VALUES ('$version');"
        echo "COMMIT;"
    } | psql_ -q >/dev/null
}

echo "==> Base : $BASE (conteneur $CONTENEUR)"

# 1. Schema de depart, uniquement si la base est vide.
if [ "$(psql_ -tAc "SELECT to_regclass('public.users') IS NOT NULL;")" = "t" ]; then
    echo "  = base-v1.4 (tables deja presentes)"
    deja_applique "base-v1.4" || psql_ -q -c "INSERT INTO schema_migrations (version) VALUES ('base-v1.4') ON CONFLICT DO NOTHING;" >/dev/null
else
    appliquer "base-v1.4" "$RACINE/db/schema-v1.4.sql"
fi

# 2. Migrations deja contenues dans schema-v1.4.sql.
#
#    Determine empiriquement, pas suppose : les rejouer sur une base neuve
#    echoue. La 003 tente par exemple de lire `grid_coordinates`, une colonne
#    que le schema de depart ne cree plus puisqu'elle l'a deja remplacee.
#
#      001 — passage v1.3 -> v1.4 ; le fichier dit lui-meme d'utiliser
#            directement schema-v1.4.sql sur une base neuve.
#      002 — colonnes de grace d'abonnement : presentes dans le schema.
#      003 — grid_points : present dans le schema.
#
#    Elles sont inscrites au journal comme appliquees, pour que l'etat reste
#    lisible et qu'une base neuve et une base historique convergent.
for version in 001_v1.3_to_v1.4 002_subscription_grace 003_grid_points; do
    deja_applique "$version" && continue
    if [ "$ETAT_SEUL" -eq 1 ]; then
        echo "  ~ $version (deja dans schema-v1.4.sql)"
    else
        psql_ -q -c "INSERT INTO schema_migrations (version) VALUES ('$version');" >/dev/null
        echo "  ~ $version (deja dans schema-v1.4.sql)"
    fi
done

# 3. Les migrations suivantes, dans l'ordre.
for f in "$RACINE"/db/migrations/0*.sql; do
    version="$(basename "$f" .sql)"
    # Les trois premieres sont traitees ci-dessus.
    case "$version" in 001_*|002_*|003_*) continue ;; esac
    appliquer "$version" "$f"
done

echo "==> Etat du journal :"
psql_ -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;" 2>/dev/null | head -20
