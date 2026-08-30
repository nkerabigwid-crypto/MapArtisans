#!/usr/bin/env bash
#
# MapArtisans — sauvegarde quotidienne de PostgreSQL.
# Installation (sur le serveur) :
#   (crontab -l 2>/dev/null; echo "17 3 * * * /opt/mapartisans/deploy/sauvegarde.sh >> /var/log/mapartisans-sauvegarde.log 2>&1") | crontab -
#
# POURQUOI PAS SEULEMENT LES SNAPSHOTS HOSTINGER
#
# Ils sont hebdomadaires et couvrent la machine entiere. Restaurer un snapshot
# pour recuperer une table effacee par erreur remet aussi le systeme, le code et
# tout le reste une semaine en arriere. Un dump SQL se restaure seul, en
# quelques secondes, sans toucher au reste.
set -euo pipefail

CONTENEUR="${PG_CONTENEUR:-mapartisans-postgres-1}"
DEST="${DEST_SAUVEGARDE:-/var/backups/mapartisans}"
RETENTION_JOURS=30
HORODATAGE="$(date +%Y-%m-%d_%Hh%M)"
FICHIER="$DEST/mapartisans_$HORODATAGE.sql.gz"

mkdir -p "$DEST"
# 700 : une sauvegarde contient TOUTE la base — mots de passe haches, jetons
# Google chiffres, coordonnees clients. Elle doit etre aussi protegee que la
# base elle-meme, ce qu'on oublie facilement.
chmod 700 "$DEST"

UTILISATEUR="$(grep '^POSTGRES_USER=' /opt/mapartisans/deploy/.env.production | cut -d= -f2)"
BASE="$(grep '^POSTGRES_DB=' /opt/mapartisans/deploy/.env.production | cut -d= -f2)"

echo "[$(date '+%F %T')] sauvegarde de $BASE"

# pg_dump ecrit sur la sortie standard ; le pipe evite d'occuper deux fois la
# place sur le disque du conteneur.
docker exec "$CONTENEUR" pg_dump -U "$UTILISATEUR" -d "$BASE" --clean --if-exists \
    | gzip -9 > "$FICHIER.partiel"

# Renommage seulement apres succes : un fichier au nom definitif est donc
# toujours un fichier complet. Sans cela, une coupure a mi-parcours laisserait
# une sauvegarde tronquee qu'on croirait valide le jour ou l'on en a besoin.
mv "$FICHIER.partiel" "$FICHIER"
chmod 600 "$FICHIER"

TAILLE="$(du -h "$FICHIER" | cut -f1)"
echo "[$(date '+%F %T')] ecrit : $FICHIER ($TAILLE)"

# Controle d'integrite : une archive gzip corrompue se detecte maintenant, pas
# le jour de la restauration.
gzip -t "$FICHIER" && echo "[$(date '+%F %T')] archive valide"

# Le dump doit contenir la table des migrations : s'il est vide ou tronque,
# cette chaine manque et la sauvegarde ne vaut rien.
if ! zgrep -q "schema_migrations" "$FICHIER"; then
    echo "[$(date '+%F %T')] ALERTE : le dump ne contient pas schema_migrations" >&2
    exit 1
fi

find "$DEST" -name 'mapartisans_*.sql.gz' -mtime "+$RETENTION_JOURS" -delete
echo "[$(date '+%F %T')] conservees : $(find "$DEST" -name 'mapartisans_*.sql.gz' | wc -l) sauvegarde(s)"
