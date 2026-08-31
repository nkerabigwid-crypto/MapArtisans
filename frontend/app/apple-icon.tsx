import { ImageResponse } from "next/og";

/**
 * Icône d'écran d'accueil pour iOS.
 *
 * iOS n'accepte pas les icônes SVG : sans ce fichier, un artisan sur iPhone
 * qui ajoute le site à son écran d'accueil obtient une capture floue de la
 * page à la place du logo.
 *
 * Sans coins arrondis ni marge : iOS applique son propre masque, et un fond
 * déjà arrondi produirait un double arrondi visible.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#123f6d",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 32 32">
          <path
            d="M16 2.5c-5.1 0-9.2 4.1-9.2 9.2 0 6.9 9.2 17.8 9.2 17.8s9.2-10.9 9.2-17.8c0-5.1-4.1-9.2-9.2-9.2z"
            fill="#ffffff"
          />
          <circle cx="16" cy="11.7" r="3.6" fill="#123f6d" />
        </svg>
      </div>
    ),
    size,
  );
}
