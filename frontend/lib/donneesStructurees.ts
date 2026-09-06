import { PLANS } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

/**
 * Données structurées de la page d'accueil.
 *
 * POURQUOI CE N'EST PAS DE LA DÉCORATION
 *
 * Un moteur — et desormais un modèle de langage — ne devine pas qu'une page
 * décrit un logiciel vendu par abonnement à trois tarifs. Le texte le dit à un
 * lecteur humain ; le balisage le dit à une machine, sans ambiguïté.
 *
 * La page /questions portait déjà un balisage FAQPage. C'est lui, et non la
 * prose, qui permet à un assistant de citer MapArtisans avec ses sources. La
 * page d'accueil n'avait pas d'équivalent : elle était lisible, mais muette.
 *
 * LES PRIX VIENNENT DU CATALOGUE
 *
 * `PLANS` est la source unique. Recopier 49 / 99 / 149 ici créerait un second
 * endroit à corriger le jour d'un changement de grille — et un écart entre le
 * prix affiché et le prix déclaré à Google est exactement le genre d'erreur
 * qu'aucun test ne rattrape et qu'un client remarque.
 */
export function donneesAccueil() {
  const editeur = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organisation`,
    name: "MapArtisans",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    // La zone desservie, pas le siège : c'est elle qui compte pour une
    // recherche locale, et elle est plus large que Sion.
    areaServed: [
      { "@type": "AdministrativeArea", name: "Suisse romande" },
      { "@type": "Country", name: "Suisse" },
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "contact@mapartisans.com",
      availableLanguage: ["fr"],
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      editeur,
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#site`,
        url: SITE_URL,
        name: "MapArtisans",
        inLanguage: "fr-CH",
        publisher: { "@id": `${SITE_URL}/#organisation` },
      },
      {
        /*
         * SoftwareApplication et non Product : c'est un service en ligne
         * accessible au navigateur, pas un bien expédié. La catégorie oriente
         * la façon dont Google présente le résultat.
         */
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#logiciel`,
        name: "MapArtisans",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "fr-CH",
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organisation` },
        description:
          "Gestion de la visibilité Google Maps pour les artisans et les " +
          "professionnels du transport en Suisse romande : demandes d'avis par " +
          "SMS, réponses rédigées au vocabulaire du métier, suivi de position " +
          "quartier par quartier.",
        offers: PLANS.map((p) => ({
          "@type": "Offer",
          name: p.name,
          price: String(p.amount),
          priceCurrency: "CHF",
          // Sans cette unité, Google lit « 49 CHF » comme un achat unique.
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: String(p.amount),
            priceCurrency: "CHF",
            billingIncrement: 1,
            unitCode: "MON",
          },
          url: `${SITE_URL}/#tarifs`,
          availability: "https://schema.org/InStock",
        })),
      },
    ],
  };
}
