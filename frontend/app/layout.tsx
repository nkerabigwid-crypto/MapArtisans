import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/site";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  weight: ["600", "700"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

// Réservé au site vitrine artisan (app/site-template) — identité visuelle
// distincte du dashboard MapArtisans, qui garde Barlow/Barlow Condensed.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  weight: ["500", "700", "800"],
  subsets: ["latin"],
});

// Titre par défaut, hérité par les pages qui n'en déclarent pas. La page
// publique (app/page.tsx) déclare le sien ; les écrans applicatifs sont des
// composants client et ne peuvent pas exporter de metadata — ils reçoivent
// donc celui-ci.
export const metadata: Metadata = {
  // metadataBase rend absolues toutes les URL relatives des balises de partage.
  // Sans elle, Next émet un avertissement au build et les aperçus WhatsApp ou
  // LinkedIn reçoivent des chemins relatifs, qu'ils ne savent pas résoudre.
  metadataBase: new URL(SITE_URL),
  title: "MapArtisans — Visibilité Google Maps pour les artisans",
  description:
    "Réponses aux avis et suivi de position sur Google Maps, pour les artisans francophones.",
  // Une adresse canonique unique : les quatre domaines secondaires redirigent
  // vers celle-ci, et déclarer autre chose diluerait le référencement que le
  // produit promet justement d'améliorer.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_CH",
    siteName: "MapArtisans",
    url: SITE_URL,
    title: "MapArtisans — Votre visibilité Google Maps en pilote automatique",
    description:
      "Pour les artisans et professionnels du transport en Suisse romande. Réponses aux avis par l'IA, suivi de position, rapport SMS chaque semaine.",
  },
  // Vos clients partageront le lien par WhatsApp : sans ces balises, l'aperçu
  // affiche une vignette vide, ce qui fait douter du sérieux du service.
  twitter: {
    card: "summary_large_image",
    title: "MapArtisans — Visibilité Google Maps",
    description: "Réponses aux avis par l'IA et suivi de position, pour les artisans romands.",
  },
  robots: { index: true, follow: true },
  /**
   * iOS ignore `display: standalone` du manifeste sur plusieurs versions
   * encore répandues et s'appuie sur ces balises. Sans elles, l'artisan qui
   * ajoute le site à son écran d'accueil relance simplement Safari, barre
   * d'adresse comprise — et ne voit aucune différence avec un signet.
   */
  appleWebApp: {
    capable: true,
    title: "MapArtisans",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /**
   * Couleur de la barre système une fois l'application lancée depuis l'écran
   * d'accueil. Sans elle, iOS et Android peignent une bande blanche au-dessus
   * de l'en-tête : l'application a l'air de flotter dans un navigateur, ce que
   * le mode plein écran devait précisément faire disparaître.
   *
   * Deux valeurs, une par thème : la couleur claire sur un téléphone en mode
   * sombre produirait une bande éblouissante en haut de l'écran.
   */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1e1b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable} ${jakarta.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
