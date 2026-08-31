import type { MetadataRoute } from "next";

/**
 * Manifeste d'application web.
 *
 * POURQUOI CECI PLUTÔT QU'UNE APPLICATION NATIVE
 *
 * La promesse du produit est « pas de tableau de bord à consulter ». Un
 * artisan l'ouvre une fois par semaine, au mieux. Une application de magasin
 * pour cet usage cumule trois frictions — la trouver, l'installer, se
 * reconnecter — pour un écran qu'on ne regarde presque jamais. Elle finirait
 * désinstallée, et la désinstallation est un signal de résiliation.
 *
 * Ce manifeste donne le seul bénéfice réel d'une application : une icône sur
 * l'écran d'accueil, un lancement en plein écran, sans barre d'adresse. Le
 * reste — notifications, présence — est déjà couvert par le SMS, qui ne
 * demande aucune installation et se lit toujours.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MapArtisans — Visibilité Google Maps",
    short_name: "MapArtisans",
    description:
      "Réponses aux avis, collecte d'avis et suivi de position sur Google Maps, pour les artisans et professionnels du transport.",
    start_url: "/tableau-de-bord",
    // `standalone` retire la barre d'adresse : l'artisan qui lance depuis son
    // écran d'accueil ne voit plus de navigateur, seulement son tableau de bord.
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f3ef",
    theme_color: "#123f6d",
    lang: "fr-CH",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        // Le SVG s'adapte à toutes les tailles sans fichier supplémentaire.
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
