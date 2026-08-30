# MapArtisans — image de production.
#
# Construction en trois étapes : les dépendances, la compilation, puis une
# image finale qui n'emporte ni les sources TypeScript, ni les outils de build,
# ni les devDependencies.

# ---------------------------------------------------------------- dépendances
FROM node:24-alpine AS deps
WORKDIR /app
# Seuls les manifestes sont copiés à cette étape : tant qu'ils ne changent pas,
# Docker réutilise le cache et l'installation n'est pas rejouée à chaque build.
COPY package.json package-lock.json ./
# redis-memory-server (dependance de TEST) telecharge et compile un binaire
# Redis dans son postinstall. Alpine n'a pas `make`, et aucun test ne tourne
# dans une image de production : on desactive ce telechargement plutot que
# d'alourdir l'image d'une chaine de compilation complete.
ENV REDISMS_DISABLE_POSTINSTALL=1
RUN npm ci

# ------------------------------------------------------------------ build
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# PAS de `prisma generate` : verifie, @prisma/client n'est importe nulle part.
# L'application lit ses donnees par l'interface `Repo`. Le schema Prisma sert
# de reference et de source aux migrations SQL, pas de client a l'execution.
# L'appeler ici telechargeait une version « release candidate » depuis le
# registre, pour generer du code que rien n'utilise.
# Les variables d'exécution NE SONT PAS nécessaires ici : elles sont lues au
# démarrage, pas à la compilation. Les injecter au build les figerait dans
# l'image — un secret dans une couche Docker est un secret publié.
RUN npm run build

# ---------------------------------------------------------------- production
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Utilisateur non privilégié : une faille dans l'application ne doit pas donner
# les droits root dans le conteneur.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# La sortie « standalone » embarque le serveur et les seules dépendances
# réellement atteintes par le code.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Sonde de vivacité : Docker et Caddy doivent savoir si le serveur répond
# vraiment, et pas seulement si le processus existe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
