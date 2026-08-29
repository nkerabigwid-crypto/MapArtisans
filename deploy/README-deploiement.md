# Mise en ligne de MapArtisans

Trois étapes : le serveur, le DNS, le démarrage. Comptez une heure la première
fois, dont une bonne partie à attendre la propagation DNS.

---

## 1. Le serveur

Un VPS suffit largement au démarrage : **2 vCPU, 4 Go de RAM, 40 Go de disque**,
sous Debian 12 ou Ubuntu 24.04. Chez Infomaniak (Suisse), Hetzner ou DigitalOcean,
c'est entre 10 et 20 CHF par mois.

Un hébergeur suisse est un argument commercial réel auprès d'artisans romands,
et il simplifie le discours sur la localisation des données.

Sur le serveur, une fois connecté en SSH :

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

## 2. Le DNS chez Hostinger

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

**Supprimez les enregistrements A ou CNAME préexistants** sur `@` et `www` —
Hostinger en crée automatiquement vers ses pages de parking, et ils entreraient
en conflit avec les vôtres.

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

## 3. Le démarrage

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
