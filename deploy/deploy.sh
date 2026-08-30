#!/usr/bin/env bash
#
# MapArtisans — mise à jour de la production.
# À exécuter SUR LE SERVEUR, depuis la racine du dépôt :  ./deploy/deploy.sh
#
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE"

COMPOSE="docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml"

echo "==> Contrôles préalables"

# Un déploiement qui démarre sans secrets construit les images, redémarre les
# conteneurs, puis échoue au lancement — en ayant coupé le service au passage.
# Mieux vaut refuser avant d'avoir rien touché.
if [ ! -f deploy/.env.production ]; then
    echo "ERREUR : deploy/.env.production absent." >&2
    echo "  cp deploy/.env.production.exemple deploy/.env.production" >&2
    exit 1
fi

# Un fichier de secrets lisible par tous les comptes du serveur n'est pas un
# secret. 600 = lisible par son seul propriétaire.
DROITS="$(stat -c '%a' deploy/.env.production 2>/dev/null || stat -f '%Lp' deploy/.env.production)"
if [ "$DROITS" != "600" ]; then
    echo "ERREUR : droits $DROITS sur deploy/.env.production. Attendu 600." >&2
    echo "  chmod 600 deploy/.env.production" >&2
    exit 1
fi

for VARIABLE in SESSION_SECRET TOKEN_ENCRYPTION_KEY POSTGRES_PASSWORD; do
    if ! grep -qE "^${VARIABLE}=.+" deploy/.env.production; then
        echo "ERREUR : ${VARIABLE} vide dans deploy/.env.production." >&2
        exit 1
    fi
done

echo "==> Récupération du code"
# Le dépôt distant n'est pas obligatoire : un premier déploiement peut se faire
# par transfert direct des fichiers, avant même que GitHub ne soit configuré.
# Dans ce cas il n'y a rien à tirer, et le script continue.
if git rev-parse --git-dir >/dev/null 2>&1 && git remote | grep -q .; then
    # La version en ligne AVANT le pull : c'est elle qu'il faudra restaurer si
    # le déploiement se passe mal.
    PRECEDENTE="$(git rev-parse --short HEAD)"
    git pull --ff-only
    echo "    $PRECEDENTE -> $(git rev-parse --short HEAD)"
else
    PRECEDENTE=""
    echo "    aucun dépôt distant : déploiement des fichiers présents sur le serveur."
fi

echo "==> Construction et démarrage"
$COMPOSE up -d --build

echo "==> Attente de la sonde de santé"
# Le conteneur peut être « démarré » sans que Next ait fini de s'initialiser.
# On interroge le serveur lui-même, pas l'état Docker.
PRET=0
for TENTATIVE in $(seq 1 30); do
    if $COMPOSE exec -T app node -e \
        "fetch('http://127.0.0.1:3000/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
        2>/dev/null; then
        echo "    application en ligne après ${TENTATIVE} tentative(s)"
        PRET=1
        break
    fi
    sleep 2
done

if [ "$PRET" -ne 1 ]; then
    echo >&2
    echo "ERREUR : l'application ne répond pas après 60 secondes." >&2
    echo "  Journaux :  $COMPOSE logs --tail=50 app" >&2
    if [ -n "$PRECEDENTE" ]; then
        echo "  Retour arrière :  git reset --hard $PRECEDENTE && ./deploy/deploy.sh" >&2
    fi
    exit 1
fi

echo "==> Vérification de l'entrée publique"
# Contrôle indispensable, appris à la dure : l'application peut répondre
# parfaitement pendant que Caddy refuse de démarrer — une variable absente dans
# le Caddyfile suffit. Sans ce test, le script annonçait « déploiement terminé »
# sur un site totalement injoignable de l'extérieur.
sleep 3
if ! $COMPOSE ps caddy --format '{{.State}}' 2>/dev/null | grep -q running; then
    echo >&2
    echo "ERREUR : Caddy ne tourne pas. Le site est injoignable depuis l'Internet." >&2
    echo "  Journaux :  $COMPOSE logs --tail=30 caddy" >&2
    exit 1
fi
echo "    Caddy en marche"

echo
if [ -n "$PRECEDENTE" ]; then
    echo "Déploiement terminé. Version $(git rev-parse --short HEAD)."
else
    echo "Déploiement terminé."
fi
