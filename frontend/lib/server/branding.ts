// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.

/**
 * Marque blanche — résolution de l'identité visuelle depuis le domaine.
 *
 * Principe : l'artisan qui se connecte sur `seo.monagence.ch` voit le logo et
 * les couleurs de son agence ; celui qui passe par `mapartisans.com` voit
 * MapArtisans.
 *
 * DEUX RÈGLES DE SÉCURITÉ NON NÉGOCIABLES
 *
 * 1. **L'apparence seulement, jamais l'autorisation.** Le domaine provient de
 *    l'en-tête `Host`, que n'importe quel client peut falsifier. Décider de ce
 *    qu'un utilisateur a le droit de voir à partir de cette valeur offrirait
 *    une élévation de privilège par simple `curl -H "Host: ..."`. Les droits
 *    restent déterminés par la session et le filtre par propriétaire du dépôt.
 *
 * 2. **La couleur est validée avant tout usage.** Elle finit dans une variable
 *    CSS ; une valeur libre venue de la base permettrait une injection CSS —
 *    masquer des éléments, superposer un faux formulaire, exfiltrer par des
 *    sélecteurs d'attribut. Seul `#RRGGBB` est accepté.
 */

export interface Branding {
  brandName: string;
  logoUrl: string | null;
  /** Toujours au format `#RRGGBB`, garanti par validateHexColor(). */
  primaryColor: string;
  supportEmail: string | null;
  /** false pour la marque MapArtisans, true pour une agence. */
  isWhiteLabel: boolean;
}

export const DEFAULT_BRANDING: Branding = {
  brandName: "MapArtisans",
  logoUrl: null,
  // En minuscules, comme toute couleur validée : sans cela, comparer une
  // couleur d'agence à la valeur par défaut échouerait sur la seule casse.
  primaryColor: "#123f6d",
  supportEmail: null,
  isWhiteLabel: false,
};

/** Enregistrement tel que stocké — ce que le dépôt renverra. */
export interface AgencyBrandingRecord {
  customDomain: string;
  brandName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
}

/**
 * Normalise un en-tête `Host` en nom de domaine comparable.
 *
 * Retire le port, met en minuscules, coupe un éventuel point final. Sans cette
 * normalisation, `SEO.MonAgence.CH:443` ne correspondrait pas à
 * `seo.monagence.ch` en base, et l'agence verrait la marque par défaut sans
 * comprendre pourquoi.
 *
 * Renvoie `null` si l'en-tête est absent ou manifestement invalide — un Host
 * falsifié ne doit pas provoquer d'erreur, seulement un repli sur la marque
 * par défaut.
 */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const sansPort = host.split(":")[0].trim().toLowerCase().replace(/\.$/, "");
  if (!sansPort) return null;
  // Un nom de domaine ne contient que lettres, chiffres, tirets et points.
  // Tout le reste est soit une tentative d'injection, soit une erreur.
  if (!/^[a-z0-9.-]+$/.test(sansPort)) return null;
  if (sansPort.length > 253) return null;
  return sansPort;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Valide une couleur hexadécimale, ou renvoie la couleur par défaut.
 *
 * Ne lève pas : une couleur invalide en base ne doit pas casser l'affichage
 * d'un artisan. Elle est simplement ignorée au profit de la couleur standard.
 */
export function validateHexColor(value: string | null | undefined): string {
  if (typeof value === "string" && HEX.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return DEFAULT_BRANDING.primaryColor;
}

/**
 * Valide une URL de logo.
 *
 * N'accepte que `https:` — une URL en `http:` déclencherait un avertissement de
 * contenu mixte, et surtout `javascript:` ou `data:` permettraient d'exécuter
 * du script si l'URL atterrissait un jour ailleurs que dans un `src`.
 */
export function validateLogoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Construit la marque affichable à partir d'un enregistrement d'agence. */
export function toBranding(record: AgencyBrandingRecord | null): Branding {
  if (!record) return DEFAULT_BRANDING;
  return {
    brandName: record.brandName?.trim() || DEFAULT_BRANDING.brandName,
    logoUrl: validateLogoUrl(record.logoUrl),
    primaryColor: validateHexColor(record.primaryColor),
    supportEmail: record.supportEmail?.trim() || null,
    isWhiteLabel: true,
  };
}

/**
 * Produit les variables CSS à injecter dans la page.
 *
 * La couleur passe par validateHexColor() une seconde fois : cette fonction
 * peut être appelée avec une marque construite ailleurs, et une validation
 * juste avant l'écriture dans le HTML est le seul endroit qui garantisse
 * réellement l'absence d'injection.
 */
export function brandingCssVars(branding: Branding): string {
  const couleur = validateHexColor(branding.primaryColor);
  return `--accent: ${couleur};`;
}
