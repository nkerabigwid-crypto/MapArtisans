# MapArtisans — raccourcis.
#
# Ces cibles ne remplacent rien : elles appellent les scripts npm et les
# scripts de deploiement existants. Le vrai garde-fou n'est pas ici, c'est le
# hook .githooks/pre-push, qui s'execute tout seul avant chaque envoi. Une
# commande qu'il faut penser a taper ne protege que les jours ou on y pense.

.PHONY: aide install dev test verifier build deployer migrer schema sauvegarde logs etat comptes admin retirer-admin

SERVEUR := mapartisans-vps
DISTANT := /opt/mapartisans

aide:
	@echo "MapArtisans — commandes disponibles"
	@echo
	@echo "  Developpement"
	@echo "    make install      installe les dependances"
	@echo "    make dev          lance le serveur local"
	@echo "    make test         suite de tests"
	@echo "    make verifier     typage + style + tests + construction (ce que fait le hook)"
	@echo
	@echo "  Production"
	@echo "    make deployer     pousse, puis met a jour le serveur"
	@echo "    make etat         etat des services et du site"
	@echo "    make logs         journaux de l'application"
	@echo "    make migrer       applique les migrations SQL"
	@echo "    make schema       compare schema.prisma a la vraie base"
	@echo "    make sauvegarde   sauvegarde immediate de la base"
	@echo
	@echo "  Acces administrateur"
	@echo "    make comptes                  liste les comptes et leur role"
	@echo "    make admin EMAIL=vous@ex.ch   donne le role admin a un compte existant"
	@echo "    make retirer-admin EMAIL=...  le retire"

install:
	cd frontend && npm install

dev:
	cd frontend && npm run dev

test:
	@echo "Tests — unicite des identifiants metier, formats, refus hors catalogue,"
	@echo "conformite Google, TVA suisse, cloisonnement entre clients."
	cd frontend && npm test

# Exactement ce que verifie le hook avant un envoi. A lancer avant de committer
# quand on veut savoir tout de suite, sans attendre le push.
verifier:
	cd frontend && npx tsc --noEmit
	cd frontend && npx eslint .
	cd frontend && npm test
	cd frontend && npm run build

build:
	cd frontend && npm run build

# Le hook pre-push bloque l'envoi si quoi que ce soit echoue : inutile de
# relancer les tests ici, ils ont deja tourne.
deployer:
	git push
	ssh $(SERVEUR) 'cd $(DISTANT) && git pull --ff-only && ./deploy/deploy.sh'

etat:
	@ssh $(SERVEUR) 'cd $(DISTANT) && docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml ps --format "  {{.Service}} {{.State}}"'
	@printf "  mapartisans.com  %s\n" "$$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://mapartisans.com)"

logs:
	ssh $(SERVEUR) 'cd $(DISTANT) && docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml logs --tail=60 app'

migrer:
	ssh $(SERVEUR) 'cd $(DISTANT) && ./db/migrate.sh'

schema:
	ssh $(SERVEUR) 'cd $(DISTANT) && ./db/verifier-schema.sh'

sauvegarde:
	ssh $(SERVEUR) '$(DISTANT)/deploy/sauvegarde.sh'

# Repondre au 404 de /admin. La console renvoie un 404 a qui n'est pas
# administrateur : elle ne peut donc pas servir a comprendre pourquoi on n'y
# entre pas. Ces trois cibles sont la seule facon de le voir.
comptes:
	@ssh $(SERVEUR) '$(DISTANT)/db/lister-comptes.sh'

# Le compte doit deja exister : on s'inscrit sur le site, puis on promeut.
admin:
	@test -n "$(EMAIL)" || { echo "Usage : make admin EMAIL=vous@exemple.ch" >&2; exit 1; }
	@ssh $(SERVEUR) '$(DISTANT)/db/promouvoir-admin.sh $(EMAIL)'

retirer-admin:
	@test -n "$(EMAIL)" || { echo "Usage : make retirer-admin EMAIL=vous@exemple.ch" >&2; exit 1; }
	@ssh $(SERVEUR) '$(DISTANT)/db/retirer-admin.sh $(EMAIL)'
