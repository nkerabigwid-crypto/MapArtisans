import type { Metadata, Viewport } from "next";
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
  title: "MapArtisans — Visibilité Google Maps pour les artisans",
  description:
    "Réponses aux avis, posts locaux et suivi de position sur Google Maps, pour les artisans francophones.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
