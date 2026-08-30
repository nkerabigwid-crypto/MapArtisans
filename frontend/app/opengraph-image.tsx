import { ImageResponse } from "next/og";

/**
 * Image d'aperçu pour les partages.
 *
 * POURQUOI ELLE COMPTE ICI PLUS QU'AILLEURS
 *
 * Vos clients partagent par WhatsApp, entre artisans. Un lien sans aperçu
 * s'affiche comme une URL nue dans la conversation : personne ne clique. Avec
 * une image, le lien devient une carte lisible qui dit ce qu'est le service.
 *
 * Générée à la construction, pas à chaque requête : le contenu ne dépend de
 * rien de dynamique.
 */
export const alt = "MapArtisans — votre visibilité Google Maps en pilote automatique";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          // Mêmes couleurs que le site : l'aperçu et la page doivent se
          // reconnaître l'un l'autre.
          background: "#f4f3ef",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 40 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <path
              d="M16 2.5c-5.1 0-9.2 4.1-9.2 9.2 0 6.9 9.2 17.8 9.2 17.8s9.2-10.9 9.2-17.8c0-5.1-4.1-9.2-9.2-9.2z"
              fill="#123f6d"
            />
            <circle cx="16" cy="11.7" r="3.6" fill="#f4f3ef" />
          </svg>
          <div style={{ fontSize: 52, fontWeight: 700, color: "#1a1d1a", letterSpacing: -1 }}>
            MapArtisans
          </div>
        </div>

        <div style={{ fontSize: 62, fontWeight: 700, color: "#1a1d1a", lineHeight: 1.12 }}>
          Votre visibilité Google Maps,
        </div>
        <div style={{ fontSize: 62, fontWeight: 700, color: "#123f6d", lineHeight: 1.12 }}>
          en pilote automatique.
        </div>

        <div style={{ fontSize: 30, color: "#6a6f69", marginTop: 38, display: "flex" }}>
          Artisans et professionnels du transport · Suisse romande
        </div>
      </div>
    ),
    size,
  );
}
