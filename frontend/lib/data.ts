/**
 * MapArtisans — données de démonstration.
 * Structure calquée sur le schéma PostgreSQL v1.3 (voir cahier des charges).
 * Aucun appel réseau : tout est mocké pour faire tourner le frontend sans
 * backend, sans clés API Google / Stripe / Twilio / OpenAI.
 */

export type GeoPointStatus = "good" | "warn" | "bad";
export type ReviewStatus = "published" | "needs_review";
export type PostStatus = "published" | "scheduled" | "draft";
export type FlagReason = "keyword_stuffing" | "duplicate" | "fake_address";

/**
 * Pays francophones desservis. La liste est volontairement ouverte : le SaaS
 * s'adresse à tout le marché francophone, pas au seul couple France/Suisse.
 */
export type Country = "CH" | "FR" | "BE" | "LU" | "CA" | "MC";

export interface Company {
  id: string;
  company_name: string;
  trade_type: string;
  country: Country;
  /** Toujours CHF : l'éditeur est suisse et facture dans sa devise. */
  currency: "CHF";
  plan_id: PlanId;
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
  plan_amount: number;
  /** Date du premier échec de prélèvement — alimente le bandeau `past_due`. */
  payment_failed_at: string | null;
  /** Fin du délai de grâce : au-delà, le service s'interrompt. */
  grace_period_ends_at: string | null;
  /** Date de résiliation effective — alimente l'écran de blocage. */
  canceled_at: string | null;
}

/**
 * Facturation en francs suisses pour tous les marchés francophones.
 * L'éditeur étant suisse, la devise ne dépend pas du pays du client.
 */
export function formatPlanLabel(company: Pick<Company, "plan_amount">) {
  return `${company.plan_amount} CHF / mois`;
}

/**
 * Paliers vendus. Le palier « agence » a été retiré le 29 août 2026 : revendu
 * avec la marge d'une agence, le même logiciel arrivait plus cher chez
 * l'artisan que sur notre propre page de tarifs. Une agence qui gère cinq
 * clients souscrit désormais cinq abonnements au prix affiché — un seul prix
 * public, vérifiable par tout le monde.
 */
export type PlanId = "essentiel" | "pro" | "complet";

export interface Plan {
  id: PlanId;
  name: string;
  /** Montant mensuel en CHF. */
  amount: number;
  /** À qui ce palier s'adresse, en une phrase. */
  audience: string;
  features: string[];
  /** Ce que le palier précédent n'avait pas — évite de relire toute la liste. */
  highlight: string | null;
  recommended: boolean;
  /**
   * Nombre d'établissements inclus.
   *
   * C'est la seule limite qui sépare un artisan d'une agence dans le modèle de
   * données : une agence est un utilisateur qui détient plusieurs entreprises
   * (`Company.userId` n'est volontairement PAS unique). Sans ce plafond, un
   * compte à 49 CHF peut gérer cinquante fiches et ne jamais payer davantage.
   */
  maxProfiles: number;
}

/**
 * Grille tarifaire — deux paliers, tous deux en CHF.
 *
 * La Geo-Grid figure dans les DEUX paliers, et ce n'est pas un oubli : c'est
 * l'argument sur lequel le client est démarché. La vendre en option reviendrait
 * à ne pas livrer ce qui a été montré à la prospection.
 *
 * Le second palier ne vend pas « plus de fonctions » mais un autre métier :
 * l'agence revend le service sous sa marque. D'où la marque blanche et le
 * générateur d'audits, qui n'ont aucun sens pour un artisan seul.
 */
export const PLANS: Plan[] = [
  {
    id: "essentiel",
    name: "Essentiel",
    amount: 49,
    audience:
      "L'indépendant qui veut être trouvé sans y passer de temps. Un seul établissement.",
    features: [
      "1 établissement",
      "Réponses aux avis par l'IA, en illimité",
      "Suivi Geo-Grid : 1 mot-clé",
      "Rapport SMS chaque semaine",
    ],
    highlight: null,
    recommended: false,
    maxProfiles: 1,
  },
  {
    id: "pro",
    name: "Pro",
    amount: 89,
    audience:
      "L'artisan qui se bat sur plusieurs quartiers et veut suivre chaque secteur de près.",
    features: [
      "Suivi Geo-Grid : 5 mots-clés",
      "Historique des positions sur 12 mois",
      // Formulation surveillée : voir la note sous PLANS. Ne jamais réintroduire
      // l'idée d'un QR code qui trierait les clients selon leur satisfaction.
      "QR code de collecte d'avis, présenté à tous les clients",
      "Support prioritaire",
      "Tout ce que contient Essentiel",
    ],
    highlight: null,
    recommended: true,
    maxProfiles: 1,
  },
  {
    id: "complet",
    name: "Complet",
    amount: 129,
    audience:
      "L'artisan qui reçoit des demandes à toute heure et ne peut pas répondre au téléphone en intervention.",
    features: [
      "Assistant sur votre site : répond aux questions de vos visiteurs",
      "Prise de rendez-vous directement dans votre agenda",
      "Réponses aux questions fréquentes, 24 h sur 24",
      "Tout ce que contient Pro",
    ],
    highlight: "Vous ne ratez plus une demande pendant un chantier.",
    recommended: false,
    maxProfiles: 1,
  },
];

/**
 * Un compte peut-il rattacher une fiche de plus ?
 *
 * À APPELER SUR LE SERVEUR, avant toute création. L'interface peut s'en servir
 * pour griser un bouton, mais un bouton grisé n'est pas une limite : la seule
 * vérification qui compte est celle du serveur, juste avant l'écriture.
 *
 * Une agence est modélisée comme un utilisateur qui détient plusieurs
 * entreprises — décision produit du 29 août 2026 : les agences sont
 * indépendantes, la fiche leur appartient. Il n'y a donc ni table
 * d'appartenance, ni double propriétaire ; `Company.userId` porte l'agence.
 */
export function peutAjouterFiche(
  planId: PlanId,
  fichesActuelles: number,
): { ok: true } | { ok: false; plafond: number; message: string } {
  const plan = PLANS.find((p) => p.id === planId);
  // Un plan inconnu ne doit pas ouvrir les vannes : on refuse. Le cas se
  // présente si un palier est retiré du catalogue alors que des comptes le
  // portent encore — refuser une création est réparable, l'inverse ne l'est pas.
  if (!plan) {
    return { ok: false, plafond: 0, message: "Formule inconnue. Contactez le support." };
  }
  if (fichesActuelles < plan.maxProfiles) return { ok: true };
  return {
    ok: false,
    plafond: plan.maxProfiles,
    message:
      plan.maxProfiles === 1
        ? `La formule ${plan.name} couvre un seul établissement.`
        : `La formule ${plan.name} couvre ${plan.maxProfiles} établissements.`,
  };
}


export interface GoogleProfile {
  business_name: string;
  city: string;
  keyword: string;
  ai_auto_reply: boolean;
  google_connected: boolean;
  best_rank: number;
}

export interface GeoPoint {
  /** Repère de la grille, ligne/colonne : A1 → C3. */
  label: string;
  /** Quartier correspondant, pour que l'artisan situe le point. */
  area: string;
  /** Coordonnées du point de scan — choisies par MapArtisans, pas issues de Google. */
  latitude: number;
  longitude: number;
  /** Position sur Google Maps. null = fiche introuvable dans les résultats. */
  position: number | null;
  /**
   * place_id de la fiche classée 1re ici. null quand l'artisan l'est lui-même.
   *
   * CONFORMITÉ — on stocke l'identifiant, jamais le nom. Les conditions de la
   * Google Maps Platform n'exemptent des restrictions de mise en cache que le
   * place_id : noms, notes et avis doivent être demandés en direct à
   * l'affichage, pas conservés en base. Voir resolveCompetitorName().
   */
  top_competitor_place_id: string | null;
}

export interface GeoGrid {
  keyword: string;
  scan_date: string;
  points: GeoPoint[]; // 9 points, ligne par ligne
}

/**
 * Position Google Maps → statut visuel.
 *
 * La règle vient du fonctionnement du Local Pack : Google n'affiche que les
 * trois premiers résultats sans que l'utilisateur ait à dérouler la liste.
 * Au-delà, la fiche existe mais n'est pas vue.
 *
 *   1        → top1  : première place, captation maximale
 *   2 – 3    → top3  : visible dans le Local Pack
 *   4 – 10   → warn  : première page, mais masquée — génère peu d'appels
 *   > 10 / null → bad : hors radar
 *
 * `null` (fiche non trouvée) est traité comme « pire que 10 », et non comme une
 * donnée manquante : pour l'artisan, être introuvable et être 40e reviennent
 * au même.
 */
export function getGridStatus(position: number | null): "top1" | "top3" | "warn" | "bad" {
  if (position === null || position > 10) return "bad";
  if (position === 1) return "top1";
  if (position <= 3) return "top3";
  return "warn";
}

export interface WeekStats {
  week_start: string;
  week_end: string;
  calls_generated: number;
  directions_generated: number;
  best_rank: number;
  best_keyword: string;
}

export interface Review {
  id: string;
  reviewer_name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  status: ReviewStatus;
  ai_reply_draft: string;
  reply_text: string | null;
  review_date: string;
}

export interface Post {
  id: string;
  content: string;
  topic_tag: string;
  status: PostStatus;
  scheduled_at: string;
}

export interface QrCode {
  label: string;
  scans_count: number;
  code_slug: string;
  /**
   * place_id Google de la fiche — c'est LUI qui construit le lien d'avis, pas
   * le google_location_id de l'API Business Profile (voir lib/server/qr.ts).
   * null tant que l'artisan n'a pas connecté sa fiche.
   */
  place_id: string | null;
}

export interface CompetitorFlag {
  id: string;
  flagged_name: string;
  reason: FlagReason;
  status: "detected" | "pending_review" | "submitted" | "rejected";
}

export const REASON_LABEL: Record<FlagReason, string> = {
  keyword_stuffing: "Nom de fiche bourré de mots-clés",
  duplicate: "Fiche en doublon",
  fake_address: "Adresse non vérifiable",
};

export const company: Company = {
  id: "c-001",
  company_name: "Dupont Plomberie",
  trade_type: "plombier",
  country: "FR",
  currency: "CHF",
  plan_id: "essentiel",
  subscription_status: "active",
  plan_amount: 49,
  payment_failed_at: null,
  grace_period_ends_at: null,
  canceled_at: null,
};

/**
 * Variantes d'abonnement pour démontrer les états non-nominaux.
 * Atteignables via ?status=past_due et ?status=canceled — voir README.
 */
export const companyVariants: Record<string, Company> = {
  past_due: {
    ...company,
    subscription_status: "past_due",
    payment_failed_at: "2026-08-19",
    grace_period_ends_at: "2026-09-02",
  },
  canceled: {
    ...company,
    subscription_status: "canceled",
    canceled_at: "2026-08-12",
  },
  trialing: { ...company, subscription_status: "trialing" },
};

/** Formate une date ISO en toutes lettres : « 2 septembre ». */
export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export const googleProfile: GoogleProfile = {
  business_name: "Dupont Plomberie",
  city: "Lyon",
  keyword: "Plombier Lyon 3",
  ai_auto_reply: true,
  google_connected: true,
  best_rank: 2,
};

// Positions relevées point par point. Les couleurs ne sont plus stockées :
// elles se déduisent de la position via getGridStatus(), pour que la règle
// reste au même endroit que sa documentation.
export const geoGrid: GeoGrid = {
  keyword: "Plombier Lyon 3",
  scan_date: "2026-08-21",
  points: [
    { label: "A1", area: "Préfecture",   latitude: 45.7640, longitude: 4.8450, position: 1,    top_competitor_place_id: null },
    { label: "A2", area: "Part-Dieu",    latitude: 45.7605, longitude: 4.8570, position: 3,    top_competitor_place_id: "ChIJ_demo_rapide" },
    { label: "A3", area: "Villeurbanne", latitude: 45.7680, longitude: 4.8790, position: 7,    top_competitor_place_id: "ChIJ_demo_sos" },
    { label: "B1", area: "Guillotière",  latitude: 45.7530, longitude: 4.8420, position: 2,    top_competitor_place_id: "ChIJ_demo_rapide" },
    { label: "B2", area: "Montchat",     latitude: 45.7510, longitude: 4.8680, position: 3,    top_competitor_place_id: "ChIJ_demo_sos" },
    { label: "B3", area: "Bron",         latitude: 45.7420, longitude: 4.9110, position: 14,   top_competitor_place_id: "ChIJ_demo_bron" },
    { label: "C1", area: "Jean Macé",    latitude: 45.7450, longitude: 4.8410, position: 6,    top_competitor_place_id: "ChIJ_demo_sos" },
    { label: "C2", area: "Monplaisir",   latitude: 45.7390, longitude: 4.8720, position: 22,   top_competitor_place_id: "ChIJ_demo_allo" },
    { label: "C3", area: "Vénissieux",   latitude: 45.7200, longitude: 4.8850, position: null, top_competitor_place_id: "ChIJ_demo_allo" },
  ],
};

/**
 * Résout un place_id en nom d'établissement.
 *
 * En production, ceci DOIT être un appel Places au moment de l'affichage
 * (Place Details, champ displayName), et non une lecture en base : les
 * conditions de la Google Maps Platform interdisent de conserver les noms
 * d'établissement, alors qu'elles autorisent le place_id sans limite de durée.
 *
 * Ici, un dictionnaire tient lieu de réponse d'API pour faire tourner le
 * prototype sans clé. La signature reste asynchrone-compatible pour que le
 * remplacement n'oblige pas à retoucher les appelants.
 */
const DEMO_PLACE_NAMES: Record<string, string> = {
  ChIJ_demo_rapide: "Plomberie Rapide SARL",
  ChIJ_demo_sos: "SOS Plomberie Rhône",
  ChIJ_demo_bron: "Bron Dépannage Sanitaire",
  ChIJ_demo_allo: "Allo Plombier 69",
};

export function resolveCompetitorName(placeId: string | null): string | null {
  if (!placeId) return null;
  return DEMO_PLACE_NAMES[placeId] ?? null;
}

export const weekStats: WeekStats = {
  week_start: "2026-08-17",
  week_end: "2026-08-21",
  calls_generated: 14,
  directions_generated: 4,
  best_rank: 2,
  best_keyword: "Plombier Lyon 3",
};

export const initialReviews: Review[] = [
  {
    id: "r-1",
    reviewer_name: "Camille R.",
    rating: 5,
    comment: "Intervention rapide un dimanche soir, tarif honnête. Je recommande.",
    status: "published",
    ai_reply_draft:
      "Merci beaucoup pour votre confiance, Camille — ravis d'avoir pu intervenir rapidement pour ce dépannage à Lyon !",
    reply_text:
      "Merci beaucoup pour votre confiance, Camille — ravis d'avoir pu intervenir rapidement pour ce dépannage à Lyon !",
    review_date: "2026-08-20",
  },
  {
    id: "r-2",
    reviewer_name: "Marc T.",
    rating: 4,
    comment: "Bon travail, un peu en retard sur l'horaire annoncé.",
    status: "published",
    ai_reply_draft:
      "Merci pour votre retour Marc, on prend note du délai pour muscler notre créneau d'intervention.",
    reply_text:
      "Merci pour votre retour Marc, on prend note du délai pour muscler notre créneau d'intervention.",
    review_date: "2026-08-18",
  },
  {
    id: "r-3",
    reviewer_name: "Sophie L.",
    rating: 2,
    comment: "Devis final plus élevé que ce qui avait été annoncé au téléphone.",
    status: "needs_review",
    ai_reply_draft:
      "Bonjour Sophie, nous sommes désolés pour ce désagrément. Pourriez-vous nous contacter directement au 04 xx xx xx xx pour qu'on regarde ça ensemble ?",
    reply_text: null,
    review_date: "2026-08-19",
  },
  {
    id: "r-4",
    reviewer_name: "Julien P.",
    rating: 5,
    comment: "Parfait, comme d'habitude.",
    status: "published",
    ai_reply_draft: "Merci Julien, toujours un plaisir d'intervenir chez vous à Lyon !",
    reply_text: "Merci Julien, toujours un plaisir d'intervenir chez vous à Lyon !",
    review_date: "2026-08-15",
  },
];

export const posts: Post[] = [
  {
    id: "p-1",
    content:
      "Purgez vos radiateurs avant l'hiver à Lyon — un geste simple qui évite bien des pannes de chauffage cet hiver.",
    topic_tag: "saison_hiver",
    status: "published",
    scheduled_at: "2026-08-15",
  },
  {
    id: "p-2",
    content: "Fuite d'eau ce week-end ? Dupont Plomberie répond 24/7 sur Lyon et sa périphérie.",
    topic_tag: "urgence_weekend",
    status: "published",
    scheduled_at: "2026-08-08",
  },
  {
    id: "p-3",
    content: "Prochain post en préparation — publication prévue vendredi.",
    topic_tag: "generique",
    status: "scheduled",
    scheduled_at: "2026-08-28",
  },
];

export const qrCode: QrCode = {
  label: "Camionnette",
  scans_count: 32,
  code_slug: "dupont-plomberie-van",
  // place_id de démonstration : celui du siège de Google à Sydney, utilisé
  // partout dans la documentation Places. Remplacé par la vraie valeur dès que
  // l'OAuth résout la fiche de l'artisan.
  place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
};


export const competitorFlags: CompetitorFlag[] = [
  {
    id: "cf-1",
    flagged_name: '"Plombier Lyon Urgence 24/7 Pas Cher Réparation"',
    reason: "keyword_stuffing",
    status: "pending_review",
  },
  {
    id: "cf-2",
    flagged_name: 'Fiche dupliquée — même adresse que "Plomberie Rapide SARL"',
    reason: "duplicate",
    status: "pending_review",
  },
];
