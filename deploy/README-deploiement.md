# Mise en ligne de MapArtisans

Trois étapes : le serveur, le DNS, le démarrage. Comptez une heure la première
fois, dont une bonne partie à attendre la propagation DNS.

---

## 1. Le serveur

Le serveur en place est un **KVM 2 chez Hostinger** : 2 vCPU, 8 Go de RAM,
100 Go de disque, à Paris. C'est confortable — le double de la mémoire
nécessaire au démarrage.

Une remarque commerciale, sans urgence : les données sont hébergées **en
France**, pas en Suisse. C'est sans difficulté juridique (la France offre un
niveau de protection reconnu), mais cela retire un argument de vente auprès
d'artisans romands, qui y sont sensibles. Une migration vers Infomaniak reste
possible plus tard ; ce n'est pas un sujet pour le lancement.

Sur le serveur, une fois connecté en SSH (`ssh root@89.116.38.42`) :

```bash
curl -fsSL https://get.docker.com | sh
```

Puis récupérez le projet, et préparez les secrets :

```bash
cp deploy/.env.production.exemple deploy/.env.production
chmod 600 deploy/.env.production
```

Remplissez-le. Générez les deux secrets applicatifs ainsi :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Le pare-feu.** N'ouvrez que trois ports. PostgreSQL et Redis ne doivent
jamais être joignables depuis l'Internet — ils ne le sont pas dans la
configuration Docker, et le pare-feu est la seconde barrière.

```bash
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
```

---

## 1 bis. Cohabitation avec n8n — À VÉRIFIER EN PREMIER

Le VPS a été livré avec le modèle Hostinger **« Ubuntu 24.04 with n8n »**. Ce
modèle installe n8n derrière un reverse proxy (Caddy ou Traefik selon les
versions) qui occupe les ports **80 et 443** — exactement ceux dont notre Caddy
a besoin.

Deux services ne peuvent pas écouter sur le même port. Si n8n tourne, notre
conteneur Caddy s'arrêtera immédiatement avec `address already in use`.

Lancez d'abord le diagnostic, qui ne modifie rien :

```bash
bash deploy/diagnostic.sh
```

### Si les ports sont libres

Rien à faire, passez à l'étape suivante.

### Si les ports sont occupés

Trois options, de la plus propre à la plus rapide.

**a) Vous n'utilisez pas n8n — arrêtez-le.** C'est le cas le plus fréquent : le
modèle a été choisi sans intention particulière. Repérez sa pile puis :

```bash
cd /root/n8n && docker compose down
```

Adaptez le chemin selon ce que le diagnostic a affiché. `down` sans `-v`
conserve les données : n8n peut être relancé plus tard.

**b) Vous utilisez n8n et voulez le garder.** Il faut alors un seul frontal
pour les deux. Le plus simple est de le placer sur un sous-domaine
(`n8n.mapartisans.com`) servi par NOTRE Caddy, et de retirer le sien. C'est une
demi-heure de travail — dites-le moi et je vous écris la configuration.

**c) Repartir d'une image propre.** Depuis le panneau Hostinger, réinstaller en
Ubuntu 24.04 nu. C'est le plus net pour une machine de production, mais cela
efface tout le serveur — à ne faire que si rien n'y est encore utile.

---

## 2. Première mise en ligne, AVANT le DNS

Votre VPS répond déjà sur le nom d'hôte fourni par Hostinger :
**`srv846053.hstgr.cloud`**. Il résout vers `89.116.38.42`, ce qui permet de
déployer et de tout vérifier **sans attendre la propagation DNS**.

C'est aussi la seule manière sûre de commencer. Au 29 août 2026, les domaines
`mapartisans.*` pointent encore vers `2.57.91.91` (le parking Hostinger).
Démarrer directement avec la configuration complète ferait échouer cinq
validations Let's Encrypt à chaque lancement — la limite est de **cinq échecs
par heure et par domaine**, et deux ou trois redémarrages suffisent à se
bloquer pour la journée.

Premier démarrage, avec la configuration réduite au seul nom d'hôte :

```bash
CADDYFILE=./Caddyfile.etape1 ./deploy/deploy.sh
```

Puis vérifiez, depuis votre machine :

```bash
curl -I https://srv846053.hstgr.cloud
```

Un `200` signifie que tout fonctionne : conteneurs, certificat, application.
Ouvrez l'adresse dans votre navigateur — c'est votre SaaS, en ligne.

À ce stade vous pouvez déjà faire une démonstration commerciale. Le nom d'hôte
est configuré en `noindex` : Google ne le référencera pas.

---

## 3. Le DNS chez Hostinger

L'adresse IP publique de votre VPS Hostinger est **`89.116.38.42`**. C'est
elle qui figure dans tous les enregistrements ci-dessous.

Dans Hostinger : **Domaines → (le domaine) → DNS / Serveurs de noms**.

### Pour `mapartisans.com` — le domaine principal

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| A | `@` | `89.116.38.42` | 3600 |
| A | `www` | `89.116.38.42` | 3600 |
| A | `cname` | `89.116.38.42` | 3600 |

L'enregistrement `cname` est la cible vers laquelle les agences feront pointer
leur propre sous-domaine, plus tard. Il ne sert à rien aujourd'hui et ne coûte
rien.

**Supprimez les enregistrements A ou CNAME préexistants** sur `@` et `www`.
Vérifié le 29 août 2026 : ils pointent vers `2.57.91.91`, le parking Hostinger.
Tant qu'ils sont là, Caddy ne peut obtenir aucun certificat pour ces domaines.

### Pour les quatre autres domaines

Identique, sur chacun de `mapartisans.ch`, `.fr`, `.online` et `.org` :

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| A | `@` | `89.116.38.42` | 3600 |
| A | `www` | `89.116.38.42` | 3600 |

Ils pointent vers le même serveur ; c'est Caddy qui les redirige en 301 vers le
`.com`. Aucune redirection à configurer chez Hostinger : la fonction « redirection
de domaine » de leur panneau ferait doublon et casserait l'obtention des
certificats.

### Vérifier avant de démarrer

Attendez la propagation — de quelques minutes à quelques heures — puis :

```bash
dig +short mapartisans.com
```

Cette commande doit renvoyer `89.116.38.42`. **Ne démarrez pas Caddy avant.** Une
demande de certificat sur un domaine qui ne pointe pas encore vers le serveur
échoue, et cinq domaines multipliés par plusieurs tentatives approchent vite du
quota Let's Encrypt de cinq échecs par heure.

---

## 4. Bascule en production

Une fois `dig +short mapartisans.com` renvoyant `89.116.38.42`, repassez à la
configuration complète — sans variable, c'est le Caddyfile de production qui
est utilisé :

```bash
./deploy/deploy.sh
```

Le script vérifie les secrets, récupère le code, reconstruit, redémarre, puis
attend que la sonde de santé réponde. Il refuse de démarrer si un secret
manque ou si `.env.production` est lisible par d'autres comptes — un
déploiement à moitié fait qui coupe le service est pire qu'un déploiement
refusé.

Le premier lancement construit les images et demande les certificats : comptez
deux à trois minutes. Suivez ce qui se passe :

```bash
docker compose -f deploy/docker-compose.yml logs -f caddy
```

Vérifiez ensuite :

```bash
curl -I https://mapartisans.com
curl -I https://mapartisans.ch
```

La première doit répondre `200`, la seconde `301` vers le `.com`.

---

## Ce qui n'est pas encore branché

À l'heure de ce déploiement, le site public, le tableau de bord et les files
d'attente fonctionnent. Ne fonctionnent PAS encore, et n'ont donc pas besoin
d'être configurés :

- **La connexion OAuth Google** — l'accès à l'API Business Profile n'est pas
  accordé. C'est ce déploiement qui permet de le demander.
- **Le paiement Stripe** — aucune clé de production, aucune route de paiement.
- **L'envoi d'e-mails** — aucun fournisseur configuré. À faire juste après la
  mise en ligne : l'authentification SPF/DKIM exige un domaine actif, sans quoi
  les e-mails de bienvenue partiront en indésirables.
- **Les mentions légales et CGV** — obligatoires avant d'encaisser le premier
  franc, avec la raison sociale de l'éditeur.

L'application démarre sans ces éléments. Elle sert le site public et permet la
démonstration, ce qui est exactement ce qu'il faut pour débloquer la suite.
