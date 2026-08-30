/**
 * Métiers proposés — source unique.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * La liste vivait à deux endroits : la page d'accueil et le formulaire
 * d'inscription. Elles ont divergé. Le 30 août 2026, la page d'accueil
 * annonçait « Taxi » parmi les métiers servis, alors que le formulaire ne
 * l'offrait pas — un chauffeur convaincu par la page arrivait sur un choix
 * qui ne le mentionnait nulle part. Le transport est pourtant la moitié de la
 * cible annoncée.
 *
 * Le `value` est ce qui part en base (`companies.trade_type`) puis dans le
 * prompt de génération des réponses aux avis : il conditionne le vocabulaire.
 * Il ne doit donc jamais changer pour un métier existant, sous peine de
 * modifier le ton des réponses de comptes déjà actifs.
 */

export interface Trade {
  /** Libellé affiché. Aligné sur les catégories Google Business Profile. */
  label: string;
  /** Identifiant stable, écrit en base. Ne jamais renommer. */
  value: string;
  /** Libellé court pour le bandeau de la page d'accueil. */
  court: string;
  /**
   * Vocabulaire propre au métier, injecté dans le prompt de génération.
   *
   * POURQUOI CE CHAMP EXISTE
   *
   * Le modèle ne recevait que l'identifiant brut — « taxi », « garage ». Il
   * écrivait donc à un chauffeur des réponses au vocabulaire d'artisan
   * (« notre intervention », « le chantier »), là où un client de taxi parle
   * de course, de trajet et de ponctualité. Un artisan reconnaît en trois
   * secondes une réponse qui ne parle pas son métier — et ses clients aussi.
   */
  lexique: string;
}

export const TRADES: Trade[] = [
  { label: "Plombier", value: "plombier", court: "Plombier", lexique: "fuite, dépannage, sanitaire, chauffe-eau, canalisation, intervention" },
  { label: "Électricien", value: "electricien", court: "Électricien", lexique: "tableau électrique, panne, mise aux normes, installation, sécurité" },
  { label: "Chauffagiste", value: "chauffagiste", court: "Chauffagiste", lexique: "chaudière, entretien, panne de chauffage, radiateur, mise en service" },
  { label: "Serrurier", value: "serrurier", court: "Serrurier", lexique: "ouverture de porte, cylindre, serrure, urgence, mise en sécurité" },
  { label: "Menuisier", value: "menuisier", court: "Menuisier", lexique: "sur-mesure, pose, bois, agencement, finition" },
  { label: "Peintre en bâtiment", value: "peintre", court: "Peintre", lexique: "chantier, finition, peinture, préparation des supports, propreté" },
  { label: "Maçon", value: "macon", court: "Maçon", lexique: "chantier, gros oeuvre, dalle, mur, terrassement" },
  { label: "Couvreur", value: "couvreur", court: "Couvreur", lexique: "toiture, étanchéité, tuiles, gouttière, isolation" },
  { label: "Vitrier", value: "vitrier", court: "Vitrier", lexique: "vitrage, remplacement, double vitrage, urgence, mise en sécurité" },
  { label: "Carreleur", value: "carreleur", court: "Carreleur", lexique: "pose, carrelage, faïence, joints, finition" },
  // --- Transport de personnes.
  { label: "Taxi", value: "taxi", court: "Taxi", lexique: "course, trajet, ponctualité, confort du véhicule, gare, aéroport, chauffeur" },
  { label: "Chauffeur VTC", value: "vtc", court: "VTC", lexique: "course, réservation, ponctualité, confort, chauffeur, trajet" },
  { label: "Transfert aéroport", value: "transfert_aeroport", court: "Transfert", lexique: "transfert, vol, ponctualité, bagages, aéroport, prise en charge" },
  // --- Automobile.
  { label: "Garage automobile", value: "garage", court: "Garage", lexique: "atelier, réparation, entretien, révision, mécanique, diagnostic, véhicule" },
  { label: "Carrosserie", value: "carrosserie", court: "Carrosserie", lexique: "carrosserie, peinture, réparation, sinistre, remise en état, véhicule" },
  { label: "Dépannage / remorquage", value: "depannage_auto", court: "Dépannage", lexique: "dépannage, remorquage, panne, prise en charge, rapidité" },
  // --- Services de proximité.
  { label: "Coiffeur", value: "coiffeur", court: "Coiffeur", lexique: "salon, coupe, coloration, rendez-vous, conseil, accueil" },
  { label: "Barbier", value: "barbier", court: "Barbier", lexique: "salon, barbe, coupe, rasage, rendez-vous, accueil" },
  { label: "Institut de beauté", value: "institut_beaute", court: "Esthétique", lexique: "institut, soin, rendez-vous, accueil, détente" },
  { label: "Autre", value: "autre", court: "Autre", lexique: "prestation, intervention, accompagnement" },
];

/** Libellés courts pour le bandeau défilant de la page d'accueil. */
export const TRADE_LABELS = TRADES.filter((t) => t.value !== "autre").map((t) => t.court);

/** Le métier existe-t-il ? À appeler côté serveur avant toute écriture en base. */
export function isKnownTrade(value: string): boolean {
  return TRADES.some((t) => t.value === value);
}

/** Métier absent du catalogue. Se traduit par un 400 côté route HTTP. */
export class InvalidBusinessTypeError extends Error {
  // Assigné dans le corps, PAS en propriété de paramètre. Le garde-fou est
  // désormais `erasableSyntaxOnly` dans tsconfig.json, qui refuse cette
  // syntaxe au typecheck plutôt que de la laisser casser les tests.
  readonly slug: string;

  constructor(slug: string) {
    super(
      `Métier inconnu : « ${slug} ». Valeurs acceptées : ` +
        `${TRADES.map((t) => t.value).join(", ")}.`,
    );
    this.name = "InvalidBusinessTypeError";
    this.slug = slug;
  }
}

/**
 * Résout un identifiant en métier, ou LÈVE.
 *
 * À utiliser sur le chemin d'ÉCRITURE — inscription, changement de métier. Un
 * identifiant hors catalogue écrit en base contamine tout ce qui suit : le
 * prompt de génération, les statistiques, les catégories Google.
 */
export function resolveTrade(slug: string): Trade {
  const t = TRADES.find((x) => x.value === slug);
  if (!t) throw new InvalidBusinessTypeError(slug);
  return t;
}

/**
 * Résout un identifiant, avec repli sur « Autre » si inconnu.
 *
 * À utiliser sur le chemin de LECTURE — génération d'une réponse à un avis.
 * Volontairement tolérant, et c'est l'inverse du chemin d'écriture : refuser
 * de répondre à un avis parce qu'un métier a disparu du catalogue punirait
 * l'artisan pour une décision de notre côté. Mieux vaut une réponse au
 * vocabulaire générique qu'un avis laissé sans réponse.
 */
export function resolveTradeOrDefault(slug: string): Trade {
  return TRADES.find((x) => x.value === slug) ?? TRADES[TRADES.length - 1];
}
