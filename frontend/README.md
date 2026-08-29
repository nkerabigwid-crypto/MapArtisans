# MapArtisans — Frontend

Page publique + dashboard artisan (Next.js, App Router, TypeScript). Implémente les écrans du
[cahier des charges UI/UX](../) avec des données mockées (`lib/data.ts`) — aucun
backend, aucune clé API réelle. But : valider l'expérience et le flux avant de
brancher Google Business Profile / Stripe / Twilio / OpenAI.

## Démarrer

Node.js est installé localement dans `~/.local/node` (pas de Homebrew sur cette
machine). Un nouveau terminal doit recharger `.zshrc` pour le voir sur le PATH :

```bash
node -v   # doit afficher v24.19.0 — sinon : source ~/.zshrc
```

Puis, depuis ce dossier :

```bash
npm install   # si node_modules a été supprimé
npm run dev   # développement, http://localhost:3000
npm run build && npm run start   # production
```

## Structure

- `app/page.tsx` — page publique (Magic UI).
- `app/tableau-de-bord/page.tsx` — orchestre l'état de l'app (vue active, avis,
  réclamations, réglages).
- `components/` — un composant par écran (`HomeView`, `ReviewsView`, `PostsView`,
  `ClientsView`, `SettingsView`), plus `TopBar`, `BottomNav`, `ReviewModal`.
- `components/ViewGate.tsx` — interpose chargement et erreur devant chaque écran.
- `components/Skeleton.tsx`, `ErrorState.tsx` — les deux états non-nominaux.
- `lib/useMockFetch.ts` — simule la latence réseau. C'est ici, et nulle part
  ailleurs, que le vrai `fetch` atterrira.
- `lib/data.ts` — données de démonstration, typées sur le schéma PostgreSQL v1.4.
- `components/ui/` — composants Magic UI, copiés dans le projet (pas un paquet npm).

## Voir les états de chargement et d'erreur

Le chargement dure 650 ms et passe vite. Deux paramètres d'URL permettent de le
figer pour inspecter ou démontrer ces écrans :

```
http://localhost:3000/tableau-de-bord?simulate=loading   # squelettes figés
http://localhost:3000/tableau-de-bord?simulate=error     # échec + bouton Réessayer
```

Chaque onglet recharge à son ouverture, comme le ferait un vrai appel réseau.

## Voir les états d'abonnement

```
http://localhost:3000/tableau-de-bord?status=past_due    # bandeau non bloquant + échéance
http://localhost:3000/tableau-de-bord?status=canceled    # blocage plein écran + réactivation
http://localhost:3000/tableau-de-bord?status=trialing    # période d'essai
```

`past_due` est volontairement **non bloquant** : la carte a été refusée, mais
l'artisan reste un client en règle — le couper de ses avis n'accélère pas le
paiement. `canceled` bloque, parce que le service a réellement cessé.

## Routes

| Route | Rôle |
|---|---|
| `/` | **Page publique** — présentation, preuve par la Geo-Grid, tarifs, appels à l'action |
| `/tableau-de-bord` | Application artisan (5 vues, nav basse) |
| `/onboarding` | Inscription en 3 étapes |
| `/abonnement` | Les trois formules |
| `/site-template` | Exemple de site vitrine artisan |

`/` est la page publique et non l'application : c'est ce qu'attend un visiteur
qui arrive du bouche-à-oreille ou d'une recherche — et ce qu'exige la demande
d'accès à l'API Google, qui réclame « un site représentant l'entreprise ».
Quand l'authentification sera en place, `/tableau-de-bord` devra passer derrière
une session ; aujourd'hui il est librement accessible.

## Onboarding

```
http://localhost:3000/onboarding
```

Trois étapes — entreprise, contact, connexion Google. L'ordre suit une
dépendance réelle : on ne peut pas demander l'accès à une fiche Google avant de
savoir quelle entreprise chercher.

Aucun compte n'est créé : le brouillon reste en mémoire. À brancher côté
backend — création du `user` + `company`, puis redirection OAuth Google dont le
retour alimente `google_profiles.google_access_token` (chiffré, voir §Sécurité
du cahier des charges).

L'étape Google énumère les accès demandés **avant** le consentement, et ce à
quoi MapArtisans n'aura jamais accès. Chaque ligne correspond à un scope réel de
l'API Google Business Profile — à tenir à jour si les scopes changent.

## Abonnement

```
http://localhost:3000/abonnement
http://localhost:3000/abonnement?status=essentiel   # met en avant un autre palier courant
http://localhost:3000/abonnement?status=agence
```

Trois paliers — Essentiel 49, Pro 89, Agence 249 — **tous en francs suisses**,
quel que soit le pays du client : l'éditeur est suisse et facture dans sa
devise. Les montants sont définis dans `PLANS` (`lib/data.ts`) et **restent à
valider commercialement**.

La Geo-Grid figure dans les trois paliers, volontairement : c'est l'argument sur
lequel le client est démarché (voir le script de prospection). La vendre en
option reviendrait à ne pas livrer ce qui lui a été montré.

Accessible aussi par Réglages › Abonnement › « Gérer ».

**Cette page ne doit jamais rendre de champ de carte bancaire.** Le paiement
passe par Stripe Checkout, hébergé sur le domaine de Stripe : les coordonnées
bancaires ne transitent donc jamais par MapArtisans, ce qui maintient
l'application hors du périmètre PCI-DSS le plus contraignant.

À brancher côté backend : création d'une session Checkout, puis
`window.location.assign(session.url)`. Au retour, **c'est le webhook Stripe qui
fait foi** pour passer `subscription_status` à `active` — jamais la redirection
de succès, qu'un utilisateur peut atteindre sans avoir payé.

**Marché francophone**, pas seulement France/Suisse : `country` accepte CH, FR,
BE, LU, CA, MC (migration `004`). La contrainte précédente rejetait purement et
simplement un artisan belge ou québécois.

## Dépendances

- **[Base UI](https://base-ui.com)** (`@base-ui/react`) — composants headless.
  Utilisé pour la feuille de réponse aux avis (`Drawer` : piège à focus, Échap,
  verrou de scroll, glissement), la confirmation de réactivation (`AlertDialog` :
  exige une réponse explicite, ne se ferme pas au clic à côté) et les
  formulaires d'onboarding (`Form`, `Field`, `Select` : libellés et erreurs
  correctement associés, navigation clavier) et la FAQ d'abonnement
  (`Accordion`).
  Aucun style imposé — le design system de `globals.css` reste la seule source.
- `app/globals.css` — le système de design (couleurs, typographie) partagé avec
  les documents du cahier des charges — clair/sombre géré via `prefers-color-scheme`.

## Ce qui n'est PAS branché

Aucun appel réseau. Pour brancher le vrai produit :

1. **Google Business Profile API** — remplacer `lib/data.ts` par des appels à
   des routes API Next.js (`app/api/.../route.ts`) qui interrogent Google et la
   base PostgreSQL (voir le schéma v1.4).
2. **Stripe** — le bouton "Gérer" dans Réglages doit ouvrir le portail client
   Stripe plutôt qu'un écran maison (déjà noté dans le cahier des charges UI/UX).
3. **Twilio** — le rapport SMS est un process backend séparé (cron), pas une
   route consultée par ce frontend.
4. **OpenAI/Anthropic** — génère `ai_reply_draft` côté backend ; ce frontend ne
   fait qu'afficher et éditer le brouillon déjà généré.

Aucune de ces intégrations ne peut être ajoutée sans les clés/comptes
correspondants, à créer par vous — voir la note sécurité du cahier des charges
sur le chiffrement des tokens avant de les stocker.

## Backend — sécurité et pipeline autonome

Voir `lib/server/` pour le code, `lib/server/__tests__/` pour les tests
(`npm test` — 40 tests, tous exécutés contre du code réel, y compris un vrai
Redis éphémère pour le pipeline).

### Sécurité

- `lib/server/crypto.ts` — AES-256-GCM pour les jetons Google (exigence du
  schéma). Nécessite `TOKEN_ENCRYPTION_KEY` dans `.env.local`.
- `lib/server/password.ts` — scrypt pour les mots de passe.
- `lib/server/session.ts` — sessions signées HMAC. Nécessite `SESSION_SECRET`.
- `middleware.ts` — protège `/tableau-de-bord` : sans session valide,
  redirection vers `/connexion`. L'autorisation fine (qui a le droit de voir
  quelle fiche) vit dans `lib/server/repo.ts`, pas ici — voir le commentaire
  en tête du fichier.

Compte de démonstration : `demo@mapartisan.ch` / `demonstration-2026`.

### Pipeline autonome (avis → IA → publication)

- `lib/server/tracking/geoGrid.ts` — classification Vert/Ambre/Rouge, pure et
  testée. Exposée via `POST /api/tracking/scan`.
- `lib/server/resilience.ts` — rejeu à délai exponentiel pour tout appel
  externe (429/503, respect de `Retry-After`, gigue aléatoire).
- `lib/server/ai/openai.ts` — génération des réponses, fournisseur **OpenAI**
  (`gpt-4o-mini`). Nécessite `OPENAI_API_KEY` — sans elle, échec bruyant, pas
  de repli silencieux.
- `lib/server/googleBusinessProfile.ts` — publication sur Google. **Pas encore
  approuvé** (voir le document « Accès API Google Business Profile ») :
  `notYetApprovedPublisher` fait échouer tout appel avec un message explicite,
  plutôt qu'un faux succès qui masquerait le jour où l'accès arrive.
- `lib/server/queue/` — file BullMQ (`reviewQueue.ts`) et worker
  (`reviewWorker.ts`), tous deux **injectables** (`generator`, `publisher`) —
  c'est ce qui permet de tester le pipeline en entier sans clé OpenAI ni accès
  Google.
- `workers/reviewWorker.ts` — point d'entrée du **processus autonome**.
  Tourne à part du serveur web (`npm run worker:reviews`), pas dans une route
  Next : un worker BullMQ doit vivre en continu, ce qu'aucun des deux modèles
  (dev server, serverless) n'offre. Voir le commentaire en tête du fichier
  pour la distinction avec un service Fastify séparé — non retenu.

```bash
npm run worker:reviews   # démarre le worker (Redis + .env.local requis)
```

`.env.local` contient `REDIS_URL=redis://localhost:6379` comme **exemple**, pas
une valeur fonctionnelle — sans un vrai Redis en écoute sur ce port, le worker
reste bloqué à tenter de s'y connecter, indéfiniment et sans message d'erreur
(ioredis retente en silence). Pour développer en local, faites tourner un vrai
Redis puis exportez son URL **avant** la commande — une variable déjà présente
dans le shell prend le pas sur celle de `.env.local` (`--env-file` ne
l'écrase pas) :

```bash
export REDIS_URL=redis://localhost:6379   # ou l'URL de votre Redis
npm run worker:reviews
```

### Pourquoi `lib/server/*` n'a PAS `import "server-only"`

Contrairement à un choix initial, ces fichiers ne portent pas ce garde-fou :
`server-only` lève de façon **inconditionnelle** hors du bundler de Next, qui
est seul à savoir le neutraliser. Comme `workers/reviewWorker.ts` tourne en
dehors de ce bundler, l'ajouter y ferait planter le worker au démarrage — ce
qui a été constaté puis corrigé pendant le développement. La frontière réelle
tient autrement : aucun composant `"use client"` n'importe `lib/server/`
(vérifié), et chaque route Next concernée déclare
`export const runtime = "nodejs"`.
