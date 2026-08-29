import { defineConfig, env } from "prisma/config";

/**
 * Configuration Prisma 7.
 *
 * Depuis la version 7, l'URL de connexion ne se déclare plus dans
 * `schema.prisma` : elle vit ici pour les commandes de migration, et se passe
 * à l'adaptateur lors de l'instanciation du client applicatif.
 *
 * DATABASE_URL n'est jamais préfixée NEXT_PUBLIC_ : la préfixer exposerait les
 * identifiants de la base dans le bundle envoyé au navigateur.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
