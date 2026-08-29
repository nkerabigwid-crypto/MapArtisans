/**
 * MapArtisan — données de démonstration
 * Structure calquée sur le schéma PostgreSQL v1.3 (voir cahier des charges).
 * Aucun appel réseau ici : tout est mocké pour faire tourner le frontend
 * sans backend, sans clés API Google/Stripe/Twilio/OpenAI.
 */

const MOCK = {
  company: {
    id: "c-001",
    company_name: "Dupont Plomberie",
    trade_type: "plombier",
    country: "FR",
    currency: "EUR",
    subscription_status: "active",
    plan_label: "49 € / mois",
  },

  googleProfile: {
    business_name: "Dupont Plomberie",
    city: "Lyon",
    keyword: "Plombier Lyon 3",
    ai_auto_reply: true,
    google_connected: true,
    best_rank: 2,
  },

  geoGrid: {
    keyword: "Plombier Lyon 3",
    scan_date: "2026-08-21",
    // 0 = vert (bon rang), 1 = orange (moyen), 2 = rouge (invisible / hors top 20)
    points: [0, 0, 1, 0, 0, 2, 1, 2, 2],
  },

  weekStats: {
    week_start: "2026-08-17",
    week_end: "2026-08-21",
    calls_generated: 14,
    directions_generated: 4,
    best_rank: 2,
    best_keyword: "Plombier Lyon 3",
  },

  reviews: [
    {
      id: "r-1",
      reviewer_name: "Camille R.",
      rating: 5,
      comment: "Intervention rapide un dimanche soir, tarif honnête. Je recommande.",
      status: "published",
      ai_reply_draft: "Merci beaucoup pour votre confiance, Camille — ravis d'avoir pu intervenir rapidement pour ce dépannage à Lyon !",
      reply_text: "Merci beaucoup pour votre confiance, Camille — ravis d'avoir pu intervenir rapidement pour ce dépannage à Lyon !",
      review_date: "2026-08-20",
    },
    {
      id: "r-2",
      reviewer_name: "Marc T.",
      rating: 4,
      comment: "Bon travail, un peu en retard sur l'horaire annoncé.",
      status: "published",
      ai_reply_draft: "Merci pour votre retour Marc, on prend note du délai pour muscler notre créneau d'intervention.",
      reply_text: "Merci pour votre retour Marc, on prend note du délai pour muscler notre créneau d'intervention.",
      review_date: "2026-08-18",
    },
    {
      id: "r-3",
      reviewer_name: "Sophie L.",
      rating: 2,
      comment: "Devis final plus élevé que ce qui avait été annoncé au téléphone.",
      status: "needs_review",
      ai_reply_draft: "Bonjour Sophie, nous sommes désolés pour ce désagrément. Pourriez-vous nous contacter directement au 04 xx xx xx xx pour qu'on regarde ça ensemble ?",
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
  ],

  posts: [
    {
      id: "p-1",
      content: "Purgez vos radiateurs avant l'hiver à Lyon — un geste simple qui évite bien des pannes de chauffage cet hiver.",
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
  ],

  qrCode: {
    label: "Camionnette",
    scans_count: 32,
    code_slug: "dupont-plomberie-van",
  },

  reviewFeedback: [
    {
      id: "f-1",
      client_name: "Client anonyme",
      message: "Le technicien avait environ 20 minutes de retard, sans prévenir.",
      status: "open",
      created_at: "2026-08-19",
    },
    {
      id: "f-2",
      client_name: "Client anonyme",
      message: "Le devis n'était pas assez détaillé à mon goût, mais le travail est bien fait.",
      status: "resolved",
      created_at: "2026-08-10",
    },
  ],

  competitorFlags: [
    {
      id: "cf-1",
      flagged_name: "\"Plombier Lyon Urgence 24/7 Pas Cher Réparation\"",
      reason: "keyword_stuffing",
      status: "pending_review",
    },
    {
      id: "cf-2",
      flagged_name: "Fiche dupliquée — même adresse que \"Plomberie Rapide SARL\"",
      reason: "duplicate",
      status: "pending_review",
    },
  ],
};

const REASON_LABEL = {
  keyword_stuffing: "Nom de fiche bourré de mots-clés",
  duplicate: "Fiche en doublon",
  fake_address: "Adresse non vérifiable",
};
