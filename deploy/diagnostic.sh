#!/usr/bin/env bash
#
# MapArtisans — état du serveur AVANT le premier déploiement.
# À exécuter sur le VPS :  bash deploy/diagnostic.sh
#
# Ne modifie rien. Il répond à une seule question : quelque chose occupe-t-il
# déjà les ports 80 et 443 ?

echo "=============================================="
echo " 1. QUI OCCUPE LES PORTS 80 ET 443 ?"
echo "=============================================="
# Le point bloquant. Caddy ne peut pas démarrer si un autre service écoute
# déjà sur ces ports : le conteneur s'arrête aussitôt avec « address already
# in use », et le déploiement échoue sans que la cause soit évidente.
if command -v ss >/dev/null; then
    ss -tlnp 2>/dev/null | grep -E ':(80|443)\s' || echo "  LIBRES — rien n'écoute."
else
    netstat -tlnp 2>/dev/null | grep -E ':(80|443)\s' || echo "  LIBRES — rien n'écoute."
fi

echo
echo "=============================================="
echo " 2. CONTENEURS DÉJÀ EN MARCHE"
echo "=============================================="
if command -v docker >/dev/null; then
    docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null || echo "  (docker installé, aucun conteneur)"
else
    echo "  Docker n'est pas installé."
fi

echo
echo "=============================================="
echo " 3. n8n EST-IL PRÉSENT ?"
echo "=============================================="
# Le modèle Hostinger « Ubuntu with n8n » installe une pile complète, souvent
# avec Caddy ou Traefik en frontal.
for CHEMIN in /root/n8n /opt/n8n /home/n8n /root/n8n-docker-caddy; do
    [ -d "$CHEMIN" ] && echo "  Répertoire trouvé : $CHEMIN"
done
docker ps -a --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -iE 'n8n|caddy|traefik|nginx' || echo "  Aucun conteneur n8n / proxy détecté."
systemctl is-active --quiet nginx 2>/dev/null && echo "  ATTENTION : nginx tourne en service système."
systemctl is-active --quiet apache2 2>/dev/null && echo "  ATTENTION : apache2 tourne en service système."

echo
echo "=============================================="
echo " 4. RESSOURCES ET PARE-FEU"
echo "=============================================="
echo "  Mémoire : $(free -h 2>/dev/null | awk '/Mem:/{print $3" utilisés sur "$2}')"
echo "  Disque  : $(df -h / 2>/dev/null | awk 'NR==2{print $3" utilisés sur "$2" ("$5")"}')"
echo "  Docker  : $(docker --version 2>/dev/null || echo 'absent — à installer')"
echo "  Pare-feu: $(ufw status 2>/dev/null | head -1 || echo 'ufw absent')"

echo
echo "=============================================="
echo " CONCLUSION"
echo "=============================================="
if ss -tlnp 2>/dev/null | grep -qE ':(80|443)\s'; then
    echo "  Les ports 80/443 sont OCCUPÉS."
    echo "  Le déploiement échouera tant que ce service n'est pas arrêté"
    echo "  ou déplacé. Voir README-deploiement.md, section « Cohabitation »."
else
    echo "  Ports libres : vous pouvez déployer."
fi
