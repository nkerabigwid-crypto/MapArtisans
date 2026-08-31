import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt.
 *
 * Le tableau de bord et les routes d'API sont exclus : ce ne sont pas des
 * pages publiques, et les laisser explorer gaspille le budget d'exploration
 * de Google sur des adresses qui répondront 302 vers la page de connexion.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // `/admin` ne répond 404 qu'aux non-administrateurs, mais l'exclure
      // évite qu'un moteur en signale l'existence dans ses résultats.
      disallow: ["/tableau-de-bord", "/admin", "/api/", "/connexion", "/abonnement"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
