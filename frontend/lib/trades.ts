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
}

export const TRADES: Trade[] = [
  { label: "Plombier", value: "plombier", court: "Plombier" },
  { label: "Électricien", value: "electricien", court: "Électricien" },
  { label: "Chauffagiste", value: "chauffagiste", court: "Chauffagiste" },
  { label: "Serrurier", value: "serrurier", court: "Serrurier" },
  { label: "Menuisier", value: "menuisier", court: "Menuisier" },
  { label: "Peintre en bâtiment", value: "peintre", court: "Peintre" },
  { label: "Maçon", value: "macon", court: "Maçon" },
  { label: "Couvreur", value: "couvreur", court: "Couvreur" },
  { label: "Vitrier", value: "vitrier", court: "Vitrier" },
  { label: "Carreleur", value: "carreleur", court: "Carreleur" },
  // --- Transport de personnes.
  { label: "Taxi", value: "taxi", court: "Taxi" },
  { label: "Chauffeur VTC", value: "vtc", court: "VTC" },
  { label: "Transfert aéroport", value: "transfert_aeroport", court: "Transfert" },
  // --- Automobile.
  { label: "Garage automobile", value: "garage", court: "Garage" },
  { label: "Carrosserie", value: "carrosserie", court: "Carrosserie" },
  { label: "Dépannage / remorquage", value: "depannage_auto", court: "Dépannage" },
  // --- Services de proximité.
  { label: "Coiffeur", value: "coiffeur", court: "Coiffeur" },
  { label: "Barbier", value: "barbier", court: "Barbier" },
  { label: "Institut de beauté", value: "institut_beaute", court: "Esthétique" },
  { label: "Autre", value: "autre", court: "Autre" },
];

/** Libellés courts pour le bandeau défilant de la page d'accueil. */
export const TRADE_LABELS = TRADES.filter((t) => t.value !== "autre").map((t) => t.court);

/** Le métier existe-t-il ? À appeler côté serveur avant toute écriture en base. */
export function isKnownTrade(value: string): boolean {
  return TRADES.some((t) => t.value === value);
}
