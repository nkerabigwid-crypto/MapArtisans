import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Produit .next/standalone : un serveur autonome embarquant uniquement les
  // dépendances réellement atteintes. Sans cela, l'image Docker doit emporter
  // tout node_modules — plusieurs centaines de mégaoctets pour rien.
  output: "standalone",
};

export default nextConfig;
