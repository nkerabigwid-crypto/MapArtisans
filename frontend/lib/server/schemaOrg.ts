// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import { resolveTradeOrDefault } from "@/lib/trades";

/**
 * Balisage Schema.org du site de l'artisan.
 *
 * OÙ CE BALISAGE VIT, ET OÙ IL NE VIT PAS
 *
 * Sur le SITE de l'artisan. Pas dans sa fiche Google : celle-ci est la base de
 * données de Google, on y renseigne des champs, on n'y injecte pas de balisage.
 * Toute proposition d'« injecter du JSON-LD dans la fiche » décrit une chose
 * qui n'existe pas.
 *
 * Ce que ce balisage fait réellement : il rend le site lisible par les robots,
 * y compris ceux qui alimentent les réponses générées par IA. C'est la seule
 * des quatre « synchronisations SEO » proposées qui soit à la fois faisable et
 * légitime.
 *
 * DEUX RÈGLES QUI ONT DICTÉ CE FICHIER
 *
 * 1. **Aucun champ inventé.** Un horaire, une zone ou un téléphone absent de
 *    nos données est simplement omis. Un balisage qui affirme des choses
 *    fausses est pire que pas de balisage : Google le confronte au reste du
 *    web et la fiche y perd en confiance.
 *
 * 2. **Aucun avis, aucune note globale.** Google est explicite : « If the
 *    entity that's being reviewed controls the reviews about itself, their
 *    pages that use LocalBusiness […] are ineligible for star review feature »,
 *    et cite nommément le cas des avis Google republiés sur son propre site.
 *    Le gabarit précédent le faisait. C'est retiré.
 */

/**
 * Type Schema.org par métier.
 *
 * Toujours le type le plus précis disponible, jamais `LocalBusiness` générique :
 * `Plumber` dit à un robot ce que `LocalBusiness` le laisse deviner. Les
 * métiers sans type dédié dans le vocabulaire retombent sur le parent le plus
 * proche — inventer un type inexistant rendrait le balisage invalide.
 */
export const TYPE_SCHEMA: Record<string, string> = {
  plombier: "Plumber",
  electricien: "Electrician",
  chauffagiste: "HVACBusiness",
  serrurier: "Locksmith",
  couvreur: "RoofingContractor",
  peintre: "HousePainter",
  // Pas de type « Carpenter », « Mason », « Glazier » ni « Tiler » dans
  // schema.org : GeneralContractor est le parent correct.
  menuisier: "GeneralContractor",
  macon: "GeneralContractor",
  vitrier: "GeneralContractor",
  carreleur: "GeneralContractor",
  taxi: "TaxiService",
  vtc: "TaxiService",
  transfert_aeroport: "TaxiService",
  garage: "AutoRepair",
  carrosserie: "AutoBodyShop",
  depannage_auto: "AutoRepair",
  coiffeur: "HairSalon",
  // Pas de type « Barber » : HairSalon est ce qui s'en approche le plus.
  barbier: "HairSalon",
  institut_beaute: "BeautySalon",
  autre: "LocalBusiness",
};

export interface DonneesSite {
  businessName: string;
  tradeType: string;
  city: string | null;
  /** Rue et numéro. Omis du balisage s'il est absent. */
  streetAddress?: string | null;
  postalCode?: string | null;
  /** Code ISO à deux lettres. */
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  email?: string | null;
  /** URL du site de l'artisan. */
  url?: string | null;
  /** Lien vers la fiche Google, s'il est connu. */
  googleMapsUrl?: string | null;
  /** Quartiers ou communes desservis. */
  areaServed?: string[];
  /** Prestations, telles que l'artisan les décrit. */
  services?: { name: string; description?: string }[];
  /** Horaires. Omis s'ils ne sont pas renseignés — jamais supposés. */
  openingHours?: { days: string[]; opens: string; closes: string }[];
}

type Noeud = Record<string, unknown>;

/** Retire les clés vides : un champ absent doit disparaître, pas valoir `null`. */
function compacter(o: Noeud): Noeud {
  const sortie: Noeud = {};
  for (const [cle, valeur] of Object.entries(o)) {
    if (valeur === null || valeur === undefined || valeur === "") continue;
    if (Array.isArray(valeur) && valeur.length === 0) continue;
    sortie[cle] = valeur;
  }
  return sortie;
}

/**
 * Produit le JSON-LD.
 *
 * Renvoie un objet, pas une chaîne : la sérialisation appartient à l'appelant,
 * qui sait s'il l'insère dans une page ou l'envoie par API.
 */
export function buildLocalBusinessJsonLd(donnees: DonneesSite): Noeud {
  const metier = resolveTradeOrDefault(donnees.tradeType);

  const adresse = compacter({
    "@type": "PostalAddress",
    streetAddress: donnees.streetAddress,
    addressLocality: donnees.city,
    postalCode: donnees.postalCode,
    // CH par défaut : le marché principal. Ce n'est pas une supposition sur
    // l'artisan, c'est la valeur que porte déjà sa fiche en base.
    addressCountry: donnees.country ?? "CH",
  });

  const geo =
    typeof donnees.latitude === "number" && typeof donnees.longitude === "number"
      ? { "@type": "GeoCoordinates", latitude: donnees.latitude, longitude: donnees.longitude }
      : null;

  return compacter({
    "@context": "https://schema.org",
    "@type": TYPE_SCHEMA[metier.value] ?? "LocalBusiness",
    name: donnees.businessName,
    // Le métier en toutes lettres : c'est ce qu'un robot lit pour comprendre
    // l'activité quand le type Schema.org reste générique.
    description: donnees.city
      ? `${metier.label} à ${donnees.city}.`
      : `${metier.label}.`,
    telephone: donnees.phone,
    email: donnees.email,
    url: donnees.url,
    // `sameAs` vers la fiche Google : c'est le lien qui rattache le site et la
    // fiche l'un à l'autre pour les robots.
    sameAs: donnees.googleMapsUrl ? [donnees.googleMapsUrl] : null,
    hasMap: donnees.googleMapsUrl,
    address: Object.keys(adresse).length > 1 ? adresse : null,
    geo,
    areaServed: donnees.areaServed?.length
      ? donnees.areaServed.map((n) => ({ "@type": "City", name: n }))
      : null,
    openingHoursSpecification: donnees.openingHours?.length
      ? donnees.openingHours.map((h) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: h.days,
          opens: h.opens,
          closes: h.closes,
        }))
      : null,
    makesOffer: donnees.services?.length
      ? donnees.services.map((s) =>
          compacter({
            "@type": "Offer",
            itemOffered: compacter({
              "@type": "Service",
              name: s.name,
              description: s.description,
            }),
          }),
        )
      : null,
    // PAS de `aggregateRating`, PAS de `review`. Voir l'en-tête du fichier :
    // des avis contrôlés par l'entité qu'ils notent rendent la page inéligible
    // aux étoiles, et exposent à une action manuelle.
  });
}

/** Sérialise pour insertion dans une balise `<script type="application/ld+json">`. */
export function serialiserJsonLd(noeud: Noeud): string {
  // `</script>` échappé : une raison sociale contenant cette suite fermerait la
  // balise et injecterait du HTML dans la page.
  return JSON.stringify(noeud).replace(/</g, "\\u003c");
}
