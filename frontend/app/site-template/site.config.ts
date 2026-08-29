/**
 * Configuration d'un site vitrine artisan — un objet, un client.
 * Pensé pour être généré depuis les mêmes lignes `companies` /
 * `google_profiles` que le dashboard (voir schéma PostgreSQL v1.3) : en
 * production, ces valeurs viennent de la base, pas d'un fichier statique.
 */

export type TradeType = "plombier" | "electricien" | "serrurier" | "chauffagiste";

/** schema.org a un type dédié pour chacun de ces métiers — jamais LocalBusiness générique. */
export const SCHEMA_TYPE: Record<TradeType, string> = {
  plombier: "Plumber",
  electricien: "Electrician",
  serrurier: "Locksmith",
  chauffagiste: "HVACBusiness",
};

/** Libellé humain de la catégorie principale Google Business Profile. */
export const GBP_PRIMARY_CATEGORY: Record<TradeType, string> = {
  plombier: "Plombier",
  electricien: "Électricien",
  serrurier: "Serrurier",
  chauffagiste: "Chauffagiste",
};

export interface Service {
  name: string;
  description: string;
  /** Catégorie GBP secondaire correspondante, pour la cohérence fiche ↔ site. */
  gbpCategory: string;
}

export interface Review {
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  date: string; // ISO
  neighborhood?: string;
}

export interface SiteConfig {
  businessName: string;
  tradeType: TradeType;
  city: string;
  neighborhoods: string[];
  addressLine: string;
  postalCode: string;
  phoneDisplay: string;
  phoneHref: string;
  email: string;
  openingHours: { day: string; hours: string }[];
  latitude: number;
  longitude: number;
  googlePlaceUrl: string;
  yearsInBusiness: number;
  aggregateRating: { value: number; count: number };
  services: Service[];
  reviews: Review[];
}

export const siteConfig: SiteConfig = {
  businessName: "Dupont Plomberie",
  tradeType: "plombier",
  city: "Lyon",
  neighborhoods: ["Lyon 2e", "Lyon 3e", "Lyon 6e", "Villeurbanne", "Caluire-et-Cuire"],
  addressLine: "14 rue de la République",
  postalCode: "69003",
  phoneDisplay: "04 78 00 00 00",
  phoneHref: "+33478000000",
  email: "contact@dupont-plomberie.fr",
  openingHours: [
    { day: "Lundi – Vendredi", hours: "7h30 – 19h00" },
    { day: "Samedi", hours: "8h00 – 12h00" },
    { day: "Urgences", hours: "24h/24, 7j/7" },
  ],
  latitude: 45.7578,
  longitude: 4.8551,
  googlePlaceUrl: "https://maps.google.com/?cid=0000000000000000000",
  yearsInBusiness: 12,
  aggregateRating: { value: 4.8, count: 127 },
  services: [
    {
      name: "Dépannage d'urgence",
      description: "Fuite, canalisation bouchée, panne de chauffe-eau — intervention sous 1h à Lyon et périphérie.",
      gbpCategory: "Plombier d'urgence",
    },
    {
      name: "Recherche de fuite",
      description: "Détection non destructive avant que la fuite n'abîme murs ou plafonds.",
      gbpCategory: "Service de détection de fuites",
    },
    {
      name: "Débouchage canalisation",
      description: "Toilettes, éviers, canalisations principales — désobstruction mécanique ou haute pression.",
      gbpCategory: "Service de débouchage",
    },
    {
      name: "Chauffe-eau",
      description: "Installation, entretien et réparation de chauffe-eau électriques et thermodynamiques.",
      gbpCategory: "Réparation de chauffe-eau",
    },
    {
      name: "Installation sanitaire",
      description: "Pose de robinetterie, WC, douche à l'italienne — devis clair avant intervention.",
      gbpCategory: "Installateur sanitaire",
    },
    {
      name: "Rénovation salle de bain",
      description: "Plomberie complète pour une rénovation de salle de bain, seul ou avec vos artisans.",
      gbpCategory: "Rénovation de salle de bain",
    },
  ],
  reviews: [
    {
      author: "Camille R.",
      rating: 5,
      text: "Intervention un dimanche soir pour une fuite sous l'évier — arrivé en 40 minutes, tarif annoncé respecté.",
      date: "2026-08-20",
      neighborhood: "Lyon 3e",
    },
    {
      author: "Marc T.",
      rating: 4,
      text: "Bon travail sur le remplacement du chauffe-eau, un peu en retard sur l'horaire mais prévenu à l'avance.",
      date: "2026-08-18",
      neighborhood: "Villeurbanne",
    },
    {
      author: "Julien P.",
      rating: 5,
      text: "Deuxième intervention chez nous, toujours aussi sérieux. On ne cherche plus ailleurs.",
      date: "2026-08-15",
      neighborhood: "Lyon 6e",
    },
    {
      author: "Sophie L.",
      rating: 5,
      text: "Recherche de fuite sans casse, contrairement à la première entreprise qu'on avait appelée.",
      date: "2026-08-02",
      neighborhood: "Lyon 2e",
    },
  ],
};
