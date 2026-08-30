import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Plan du site.
 *
 * Ne contient que les pages réellement publiques et indexables. Y déclarer
 * `/tableau-de-bord` ou `/onboarding` reviendrait à demander à Google
 * d'explorer des pages qui redirigent — ce qui dégrade la confiance accordée
 * au plan lui-même.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date();
  return [
    { url: SITE_URL, lastModified: maintenant, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/questions`, lastModified: maintenant, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/audit`, lastModified: maintenant, changeFrequency: "monthly", priority: 0.6 },
  ];
}
