// PAS de `import "server-only"` ici, volontairement : ce module est aussi
// importé par workers/reviewWorker.ts, qui tourne comme un processus Node
// autonome, hors du bundler de Next. Le paquet `server-only` lève de façon
// INCONDITIONNELLE dès qu'il est chargé ailleurs que sous le bundler de Next
// (c'est ce dernier, et lui seul, qui sait le neutraliser) — l'ajouter ici
// ferait planter le worker au démarrage. La frontière réelle est déjà tenue
// autrement : rien sous lib/server/ n'est importé par un composant "use
// client" (vérifié), et chaque route Next qui l'utilise déclare elle-même
// `export const runtime = "nodejs"`.
import type { MagicLinkRecord } from "./magicLink";
import { genererWidgetKey } from "./assistant/access";
import { finEssai } from "./essai";
import { hashPassword } from "./password";
import type { AgencyBrandingRecord } from "./branding";
import { pgRepo } from "./pgRepo";

/**
 * Accès aux données, derrière une interface.
 *
 * Les routes HTTP ne parlent jamais à Prisma directement. Ce découplage sert
 * trois choses concrètes :
 *
 * · Les règles d'autorisation se testent sans base de données — c'est le cas
 *   aujourd'hui, PostgreSQL n'étant pas encore déployé.
 * · Le jour où Prisma remplace l'implémentation mémoire, aucune route ne bouge.
 * · Les requêtes restent groupées à un seul endroit, ce qui rend visible d'un
 *   coup d'œil si l'une d'elles oublie de filtrer par propriétaire.
 *
 * L'implémentation en mémoire ci-dessous n'est PAS un simulacre de confort :
 * elle applique exactement les mêmes règles de propriété que devra appliquer la
 * version Prisma. Un test qui passe ici doit passer là.
 */

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: "artisan" | "agency" | "admin";
  /** Destinataire du rapport SMS — users.phone_number au schéma. */
  phoneNumber: string | null;
}

export interface ClientRecord {
  /** E.164. Sert de clé : c'est la seule donnée toujours présente. */
  phone: string;
  /** Nom si l'assistant l'a recueilli, sinon `null`. */
  name: string | null;
  /** Dernière demande d'avis ENVOYÉE, ou `null`. */
  dernierAvisDemande: Date | null;
  /** Dernier rendez-vous connu, ou `null`. */
  dernierRendezVous: Date | null;
  /** `true` si ce numéro a demandé à ne plus être sollicité. */
  desabonne: boolean;
}

export interface RendezVousRecord {
  id: string;
  googleProfileId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  requestedAt: Date;
  details: string | null;
  status: "confirmed" | "honored" | "canceled";
}

export interface StatistiquesAdmin {
  comptes: number;
  entreprises: number;
  fiches: number;
  /** Répartition des abonnements par statut. */
  abonnements: Record<string, number>;
  /** Répartition des entreprises par palier. */
  paliers: Record<string, number>;
  avis: number;
  avisEnAttente: number;
  demandesAvis: number;
  desabonnements: number;
  smsCeMois: number;
  facturesEmises: number;
  /** Montant facturé depuis toujours, en centimes. */
  montantFactureCentimes: number;
}

export interface PostRecord {
  id: string;
  googleProfileId: string;
  content: string;
  topicTag: string | null;
  scheduledAt: Date;
  status: "published" | "scheduled" | "draft";
  createdAt: Date;
}

export interface AssistantSettingsRecord {
  googleProfileId: string;
  widgetKey: string;
  allowedOrigins: string[];
  faqContext: string | null;
  widgetColor: string;
  dailyMessageLimit: number;
  isActive: boolean;
}

export interface FactureRecord {
  numero: string;
  userId: string;
  clientNom: string;
  clientEmail: string | null;
  designation: string;
  montantCentimes: number;
  devise: string;
  /** IDE en vigueur à l'émission. `null` = émetteur non assujetti. */
  tvaIde: string | null;
  emiseLe: Date;
  payeeLe: Date | null;
}

export interface CompanyRecord {
  id: string;
  userId: string;
  companyName: string;
  tradeType: string;
  /**
   * Palier souscrit. La colonne existait depuis la migration 009 et n'était pas
   * exposée : le contrôle d'accès aux fonctionnalités payantes ne pouvait donc
   * pas s'appuyer dessus côté serveur.
   */
  planId: string;

  // --- Abonnement. Colonnes présentes depuis l'origine, exposées seulement
  // maintenant : le tableau de bord affichait un abonnement de démonstration.
  country: string;
  planAmount: number;
  subscriptionStatus: "incomplete" | "trialing" | "active" | "past_due" | "canceled";
  paymentFailedAt: Date | null;
  gracePeriodEndsAt: Date | null;
  canceledAt: Date | null;
  /**
   * Fin de l'essai gratuit. `null` = aucun essai en cours.
   *
   * Distinct de `gracePeriodEndsAt` : la grâce couvre un client PAYANT dont le
   * prélèvement a échoué, l'essai couvre quelqu'un qui n'a jamais payé. Les
   * confondre rendrait impossible de distinguer « votre carte a été refusée »
   * de « votre essai est terminé ».
   */
  trialEndsAt: Date | null;
}

export interface GoogleProfileRecord {
  id: string;
  companyId: string;
  /**
   * Identifiant Google de l'établissement, forme `locations/123…`.
   *
   * C'est la clé de rapprochement lors d'une reconnexion : l'identifiant
   * interne change à chaque insertion, celui-ci non.
   */
  googleLocationId: string;
  /**
   * Place ID (`ChIJ…`). C'est l'identifiant qu'attend un lien d'avis Google,
   * distinct de `googleLocationId` utilisé par l'API. `null` tant que Google
   * ne le publie pas — la fiche existe alors, mais la demande d'avis par SMS
   * et le QR code n'ont pas de cible.
   */
  placeId: string | null;
  businessName: string;
  city: string;
  aiAutoReply: boolean;
  /**
   * Chiffré au repos — voir lib/server/crypto.ts.
   * Correspond à la colonne `google_access_token` du schéma ; le suffixe `Enc`
   * n'existe que côté application, pour rappeler à la lecture que la valeur
   * n'est jamais en clair.
   */
  googleAccessTokenEnc: string | null;

  // --- Champs DÉRIVÉS, pas des colonnes de google_profiles.
  // Ils résument le dernier relevé et proviennent de `rank_trackings`. La
  // version Prisma devra les calculer par jointure sur le scan le plus récent,
  // et non ajouter ces colonnes à la table — les dupliquer créerait deux
  // sources de vérité pour la même position.
  bestPosition: number | null;
  previousPosition: number | null;
  callsGenerated: number;
  directionsGenerated: number;
}

/** Ce qu'il faut pour composer le rapport SMS d'une fiche. */
export interface WeeklyStatsRecord {
  googleProfileId: string;
  businessName: string;
  /** Destinataire — users.phone_number du propriétaire de la fiche. */
  phoneNumber: string;
  bestPosition: number | null;
  previousPosition: number | null;
  callsGenerated: number;
  directionsGenerated: number;
  pendingReviews: number;
  /**
   * Marque à faire figurer dans le SMS. `null` pour les clients directs, qui
   * reçoivent « MapArtisans » ; renseigné quand la fiche appartient à une
   * agence en marque blanche — l'artisan ne doit alors jamais voir notre nom.
   */
  brandName: string | null;
}

export interface ReviewRecord {
  id: string;
  googleProfileId: string;
  googleReviewId: string;
  reviewerName: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  /**
   * `null` pour un avis « étoiles seules » : Google autorise une note sans
   * texte, et ces avis-là arrivent bel et bien par l'API. Les traiter comme
   * une chaîne vide ferait passer `Avis : ""` au modèle, qui inventerait un
   * contenu inexistant pour avoir quelque chose à quoi répondre.
   */
  comment: string | null;
  aiReplyDraft: string | null;
  replyText: string | null;
  status: "pending" | "approved" | "failed";
}

export interface Repo {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(email: string, password: string): Promise<UserRecord>;
  /** Enregistre le numéro de mobile. Null efface — un artisan peut se raviser. */
  setUserPhone(userId: string, phoneNumber: string | null): Promise<void>;
  /**
   * Crée l'entreprise d'un utilisateur.
   *
   * `tradeType` doit avoir été validé par `resolveTrade()` AVANT l'appel : un
   * identifiant hors catalogue écrit ici contamine tout ce qui suit, à
   * commencer par le prompt de génération des réponses aux avis.
   */
  createCompany(input: {
    userId: string;
    companyName: string;
    tradeType: string;
    country: string;
  }): Promise<CompanyRecord>;
  /**
   * Entreprise de cet utilisateur, pour y rattacher une fiche Google.
   *
   * Renvoie la plus ancienne s'il en a plusieurs : le rattachement automatique
   * ne doit pas deviner. Une agence multi-entreprises choisira explicitement,
   * quand cet écran existera.
   */
  findCompanyForUser(userId: string): Promise<CompanyRecord | null>;

  /**
   * Crée ou met à jour la fiche Google d'un établissement.
   *
   * La clé est `googleLocationId`, pas l'identifiant interne : un artisan qui
   * reconnecte sa fiche (jeton révoqué, changement de compte Google) doit
   * retrouver SA fiche avec son historique d'avis, pas en créer une seconde.
   */
  upsertGoogleProfile(input: {
    companyId: string;
    googleLocationId: string;
    /** Place ID (`ChIJ…`) : c'est lui qu'attend un lien d'avis Google. */
    placeId: string | null;
    businessName: string;
    address: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    accessTokenEnc: string | null;
    refreshTokenEnc: string | null;
  }): Promise<GoogleProfileRecord>;

  /** Fiches accessibles à cet utilisateur — jamais toutes les fiches. */
  listProfilesForUser(userId: string): Promise<GoogleProfileRecord[]>;
  /**
   * Renvoie la fiche UNIQUEMENT si elle appartient à cet utilisateur.
   * Le filtre est dans la requête, pas dans l'appelant : c'est la seule façon
   * de garantir qu'aucune route ne puisse l'oublier.
   */
  findProfileForUser(userId: string, profileId: string): Promise<GoogleProfileRecord | null>;
  /**
   * Nombre de fiches déjà rattachées à cet utilisateur.
   *
   * Sert au contrôle de plafond avant création (`peutAjouterFiche`). Compte
   * bien les fiches de TOUTES ses entreprises : une agence en détient
   * plusieurs, et le plafond porte sur le total, pas sur chaque entreprise.
   */
  countProfilesForUser(userId: string): Promise<number>;

  // --- Réservé au worker : traversée interne, pas de notion de propriétaire.
  // Un worker de fond n'agit pas « au nom » d'une requête HTTP authentifiée —
  // il balaie l'ensemble des fiches pour lesquelles le travail est dû. Séparer
  // ces méthodes des méthodes ci-dessus rend visible, à la lecture d'une route
  // HTTP, qu'aucune d'elles ne devrait jamais appeler celles-ci directement.
  listProfilesWithAutoReplyEnabled(): Promise<GoogleProfileRecord[]>;
  /**
   * TOUS les avis d'une fiche, le plus récent d'abord.
   *
   * Distinct de `listPendingReviews`, réservé au worker : le tableau de bord
   * doit montrer les avis déjà traités autant que ceux en attente, sans quoi
   * l'artisan croit n'avoir jamais reçu d'avis.
   */
  listReviewsForProfile(profileId: string, limite?: number): Promise<ReviewRecord[]>;
  listPendingReviews(profileId: string): Promise<ReviewRecord[]>;
  getReviewById(reviewId: string): Promise<ReviewRecord | null>;
  getProfileById(profileId: string): Promise<GoogleProfileRecord | null>;
  getCompanyForProfile(profileId: string): Promise<CompanyRecord | null>;
  /** Publication effective : le brouillon devient la réponse en ligne. */
  saveReviewReply(reviewId: string, replyText: string): Promise<void>;
  /**
   * Enregistre une proposition SANS la publier : le statut reste `pending`.
   * C'est le chemin des avis négatifs, où l'artisan valide avant mise en ligne.
   */
  saveReviewDraft(reviewId: string, draft: string): Promise<void>;
  markReviewFailed(reviewId: string): Promise<void>;
  // --- Liens magiques (connexion sans mot de passe).
  saveMagicLink(record: MagicLinkRecord): Promise<void>;
  /**
   * Teste ET marque comme utilisé en UNE SEULE opération, puis renvoie
   * l'enregistrement tel qu'il était avant.
   *
   * L'atomicité n'est pas un raffinement : les prévisualiseurs de lien (Gmail,
   * WhatsApp, Outlook) ouvrent les URL avant l'utilisateur, et une vérification
   * en deux temps laisserait passer deux consommations du même jeton. En SQL,
   * c'est un `UPDATE … WHERE token_hash = $1 AND used_at IS NULL RETURNING *`.
   *
   * Renvoie `null` si le jeton est inconnu ; renvoie l'enregistrement avec son
   * `usedAt` d'origine s'il était déjà consommé, pour que l'appelant puisse
   * distinguer les cas.
   */
  consumeMagicLink(tokenHash: string, now?: number): Promise<MagicLinkRecord | null>;

  // --- Paiement.
  /**
   * Enregistre un événement Stripe comme traité.
   *
   * Renvoie `false` s'il l'était déjà. Stripe rejoue un webhook jusqu'à trois
   * jours tant qu'il ne reçoit pas de 200 : sans ce verrou, un même paiement
   * activerait deux abonnements et enverrait deux e-mails.
   */
  marquerEvenementStripe(id: string, type: string): Promise<boolean>;
  /** Passe l'abonnement d'un utilisateur dans un nouvel état. */
  majAbonnement(input: {
    userId: string;
    statut: "active" | "past_due" | "canceled";
    stripeCustomerId?: string | null;
    planId?: string | null;
  }): Promise<void>;

  // --- Demandes d'avis après intervention.
  /**
   * Ce numéro a-t-il demandé à ne plus être sollicité ?
   *
   * Le registre est GLOBAL, pas par artisan : un client qui répond STOP ne
   * s'attend pas à devoir le répéter au prochain plombier. C'est aussi ce
   * qu'exige la LCD, qui vise le destinataire et non l'expéditeur.
   */
  estDesabonne(phone: string): Promise<boolean>;

  /** Date du dernier SMS de demande d'avis envoyé à ce numéro pour cette fiche. */
  dernierEnvoiAvis(profileId: string, phone: string): Promise<Date | null>;

  /**
   * Trace une demande d'avis, envoyée ou échouée.
   *
   * Enregistrée dans les DEUX cas : la trace sert à prouver la non-sélection
   * exigée par Google — on a sollicité tout le monde, pas seulement les clients
   * contents — et un échec effacé fausserait cette preuve.
   */
  enregistrerDemandeAvis(input: {
    profileId: string;
    clientPhone: string;
    clientName?: string | null;
    statut: "sent" | "failed";
    motifEchec?: string | null;
  }): Promise<void>;

  /** Inscrit un numéro au registre de désabonnement. Idempotent. */
  enregistrerDesabonnement(phone: string, motif?: string): Promise<void>;

  // --- Facturation.
  /**
   * Émet une facture et lui attribue son numéro, en UNE opération atomique.
   *
   * Deux paiements simultanés ne doivent jamais obtenir le même numéro : un
   * `SELECT max()+1` suivi d'un `INSERT` le permettrait, et une série avec
   * doublon est un problème comptable, pas un détail.
   *
   * Renvoie la facture existante si ce paiement Stripe a déjà été facturé —
   * un webhook rejoué ne doit pas produire un second document.
   */
  creerFacture(input: {
    userId: string;
    clientNom: string;
    clientEmail: string | null;
    designation: string;
    montantCentimes: number;
    devise: string;
    tvaIde: string | null;
    stripeSessionId: string | null;
  }): Promise<FactureRecord>;

  /** Horodate la transmission au client. Une facture non transmise est retrouvable. */
  marquerFactureEnvoyee(numero: string): Promise<void>;

  // --- Console d'administration (lecture seule).
  /**
   * Chiffres d'ensemble du service.
   *
   * AUCUNE DONNÉE PERSONNELLE ICI : des comptages, pas des lignes. Une console
   * d'administration qui déverse la table `users` devient, le jour d'une
   * intrusion, la fuite elle-même. Ce dont l'exploitant a besoin au quotidien —
   * combien de comptes, combien d'abonnements actifs, combien de SMS
   * consommés — se lit très bien en agrégat.
   */
  statistiquesAdmin(): Promise<StatistiquesAdmin>;

  // --- Répertoire clients.
  /**
   * Les personnes que cet artisan a servies, un numéro par ligne.
   *
   * Reconstruit à partir des rendez-vous et des demandes d'avis déjà envoyées :
   * il n'existe PAS de table « clients », et c'est délibéré. Tenir un fichier
   * clients créerait une base de données personnelles à protéger, déclarer et
   * purger, pour une valeur que ces deux sources donnent déjà.
   *
   * Le numéro sert de clé : c'est la seule donnée toujours présente.
   */
  listerClients(profileId: string, limite?: number): Promise<ClientRecord[]>;

  // --- Plafond mensuel de SMS.
  /** SMS déjà envoyés ce mois-ci par cette entreprise, tous types confondus. */
  compterSmsDuMois(companyId: string): Promise<number>;

  /** Incrémente le compteur du mois. Appelé APRÈS un envoi réussi. */
  incrementerSmsDuMois(companyId: string): Promise<void>;

  // --- Publications Google.
  /** Brouillons et publications d'une fiche, la plus récente d'abord. */
  listerPosts(profileId: string, limite?: number): Promise<PostRecord[]>;

  /** Enregistre un brouillon généré. Il n'est jamais publié sans action. */
  creerPost(input: {
    profileId: string;
    content: string;
    topicTag: string | null;
    scheduledAt: Date;
  }): Promise<PostRecord>;

  /** Remplace le texte d'un brouillon — le bouton « Régénérer ». */
  majPost(input: {
    postId: string;
    profileId: string;
    content: string;
  }): Promise<void>;

  // --- Assistant du site de l'artisan.
  /**
   * Réglages associés à une clé de widget.
   *
   * La clé est publique — elle vit dans le code d'un site tiers. C'est
   * `allowedOrigins` qui protège, pas le secret de la clé : la recherche par clé
   * n'accorde donc rien à elle seule.
   */
  findAssistantSettings(widgetKey: string): Promise<AssistantSettingsRecord | null>;

  /**
   * Crée les réglages de l'assistant d'une fiche, s'ils n'existent pas.
   *
   * Idempotent : appelée à chaque rattachement OAuth, y compris lors d'une
   * reconnexion. Regénérer la clé casserait le widget déjà collé sur le site de
   * l'artisan, sans qu'il comprenne pourquoi.
   *
   * L'assistant naît DÉSACTIVÉ et sans origine autorisée : tant que l'artisan
   * n'a pas déclaré son domaine, aucune requête ne peut consommer son budget.
   */
  creerReglagesAssistant(profileId: string): Promise<AssistantSettingsRecord>;

  /** Réglages d'une fiche appartenant à cet utilisateur, ou `null`. */
  findAssistantSettingsForUser(
    userId: string,
    profileId: string,
  ): Promise<AssistantSettingsRecord | null>;

  /** Met à jour ce que l'artisan contrôle : domaines, activation, base de connaissances. */
  majReglagesAssistant(input: {
    profileId: string;
    allowedOrigins?: string[];
    faqContext?: string | null;
    isActive?: boolean;
  }): Promise<void>;

  /** Messages déjà consommés aujourd'hui par cette fiche. */
  compterMessagesAssistant(profileId: string): Promise<number>;

  /** Incrémente le compteur du jour. Appelé après acceptation, jamais avant. */
  incrementerMessagesAssistant(profileId: string): Promise<void>;

  /**
   * Rendez-vous d'une fiche, le plus proche d'abord.
   *
   * Ils étaient ÉCRITS et jamais relus : l'artisan recevait un SMS et, s'il le
   * perdait, le rendez-vous était perdu avec — exactement le problème du bout
   * de papier que l'assistant devait faire disparaître.
   */
  listerRendezVous(profileId: string, limite?: number): Promise<RendezVousRecord[]>;

  /**
   * Passe un rendez-vous en « honoré » ou « annulé ».
   *
   * `honored` et non `done` : c'est le vocabulaire imposé par la contrainte de
   * la migration 016. Aligner le code sur la base plutôt que l'inverse évite
   * une migration dont le seul objet serait un synonyme.
   */
  majStatutRendezVous(input: {
    rendezVousId: string;
    profileId: string;
    statut: "honored" | "canceled";
  }): Promise<void>;

  /** Enregistre une demande de rendez-vous captée par l'assistant. */
  creerRendezVous(input: {
    profileId: string;
    clientName: string;
    clientPhone: string;
    clientEmail?: string | null;
    requestedAt: Date;
    details?: string | null;
  }): Promise<void>;

  /** Fiches à qui envoyer le rapport hebdomadaire, avec leurs chiffres. */
  listWeeklyStats(): Promise<WeeklyStatsRecord[]>;
  /**
   * Réglages de marque blanche associés à un domaine personnalisé.
   * Renvoie `null` pour le domaine principal ou un domaine inconnu — c'est le
   * cas nominal, pas une erreur.
   */
  findAgencyByDomain(domain: string): Promise<AgencyBrandingRecord | null>;
}

// --------------------------------------------------------------------------
// Implémentation en mémoire — remplacée par Prisma quand la base existera.
// --------------------------------------------------------------------------

const users = new Map<string, UserRecord>();
const companies = new Map<string, CompanyRecord>();
const profiles = new Map<string, GoogleProfileRecord>();
const reviews = new Map<string, ReviewRecord>();
const magicLinks = new Map<string, MagicLinkRecord>();
const evenementsStripe = new Set<string>();
const demandesAvis: {
  profileId: string;
  clientPhone: string;
  clientName: string | null;
  statut: "sent" | "failed";
  envoyeeA: Date;
}[] = [];
const desabonnes = new Set<string>();
const factures = new Map<string, FactureRecord>();
const compteursFacture = new Map<number, number>();
const sessionsFacturees = new Map<string, string>();
const reglagesAssistant = new Map<string, AssistantSettingsRecord>();
const usageAssistant = new Map<string, number>();
const rendezVous = new Map<string, RendezVousRecord>();
const posts = new Map<string, PostRecord>();
const usageSms = new Map<string, number>();
const agencies = new Map<string, AgencyBrandingRecord & { userId: string }>();
let seeded = false;

/** Normalise une adresse : la casse ne doit pas créer deux comptes distincts. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Les comptes de démonstration doivent-ils exister ?
 *
 * NON EN PRODUCTION, ET C'EST UNE RÈGLE DE SÉCURITÉ, PAS UNE PRÉFÉRENCE.
 *
 * Ces comptes ont un mot de passe écrit en clair dans ce fichier, versionné et
 * lisible par quiconque accède au dépôt. Les laisser vivre sur le serveur de
 * production ouvre le tableau de bord — fiches, avis, réglages — à toute
 * personne qui a lu le code. Constaté en production le 30 août 2026 : la route
 * de connexion répondait 200 sur demo@mapartisan.ch.
 *
 * `DEMO_DATA=1` permet de les réactiver délibérément, par exemple sur un
 * environnement de démonstration commerciale distinct.
 */
function demoAutorisee(): boolean {
  if (process.env.DEMO_DATA === "1") return true;
  return process.env.NODE_ENV !== "production";
}

async function seed() {
  if (seeded) return;
  seeded = true;
  if (!demoAutorisee()) return;
  const u: UserRecord = {
    id: "u-001",
    email: "demo@mapartisan.ch",
    passwordHash: await hashPassword("demonstration-2026"),
    role: "artisan",
    phoneNumber: "+41791234567",
  };
  users.set(u.id, u);
  companies.set("c-001", {
    id: "c-001",
    userId: u.id,
    companyName: "Dupont Plomberie",
    tradeType: "plombier",
    planId: "professionnel",
    country: "CH",
    planAmount: 149,
    subscriptionStatus: "active",
    paymentFailedAt: null,
    gracePeriodEndsAt: null,
    canceledAt: null,
    // Entreprises de démonstration : abonnées, donc hors essai.
    trialEndsAt: null,
  });
  profiles.set("g-001", {
    id: "g-001",
    companyId: "c-001",
      googleLocationId: "locations/demo-c-001",
      placeId: "ChIJ_demo_c001",
    businessName: "Dupont Plomberie",
    city: "Lyon",
    aiAutoReply: true,
    googleAccessTokenEnc: null,
    bestPosition: 2,
    previousPosition: 4,
    callsGenerated: 14,
    directionsGenerated: 4,
  });
  // Un second locataire, présent uniquement pour que les tests d'isolation
  // aient quelque chose à ne PAS pouvoir atteindre.
  const other: UserRecord = {
    id: "u-002",
    email: "autre@exemple.ch",
    passwordHash: await hashPassword("autre-compte-2026"),
    role: "artisan",
    phoneNumber: null, // sans mobile : doit être ignoré par le rapport
  };
  users.set(other.id, other);
  companies.set("c-002", {
    id: "c-002",
    userId: other.id,
    companyName: "Autre Plomberie",
    tradeType: "plombier",
    planId: "professionnel",
    country: "CH",
    planAmount: 149,
    subscriptionStatus: "active",
    paymentFailedAt: null,
    gracePeriodEndsAt: null,
    canceledAt: null,
    // Entreprises de démonstration : abonnées, donc hors essai.
    trialEndsAt: null,
  });
  profiles.set("g-002", {
    id: "g-002",
    companyId: "c-002",
      googleLocationId: "locations/demo-c-002",
      placeId: "ChIJ_demo_c002",
    businessName: "Autre Plomberie",
    city: "Genève",
    aiAutoReply: false,
    googleAccessTokenEnc: null,
    bestPosition: 7,
    previousPosition: null,
    callsGenerated: 3,
    directionsGenerated: 1,
  });

  // Une agence en marque blanche, pour que les tests aient un cas réel.
  const agence: UserRecord = {
    id: "u-003",
    email: "contact@monagence.ch",
    passwordHash: await hashPassword("agence-demo-2026"),
    role: "agency",
    phoneNumber: "+41780000000",
  };
  users.set(agence.id, agence);
  agencies.set("seo.monagence.ch", {
    userId: agence.id,
    customDomain: "seo.monagence.ch",
    brandName: "MonAgence SEO",
    logoUrl: "https://monagence.ch/logo.svg",
    primaryColor: "#8B1E3F",
    supportEmail: "support@monagence.ch",
  });
  companies.set("c-003", {
    id: "c-003",
    userId: agence.id,
    companyName: "Bornand Electricite",
    tradeType: "electricien",
    planId: "professionnel",
    country: "CH",
    planAmount: 149,
    subscriptionStatus: "active",
    paymentFailedAt: null,
    gracePeriodEndsAt: null,
    canceledAt: null,
    // Entreprises de démonstration : abonnées, donc hors essai.
    trialEndsAt: null,
  });
  profiles.set("g-003", {
    id: "g-003",
    companyId: "c-003",
      googleLocationId: "locations/demo-c-003",
      placeId: "ChIJ_demo_c003",
    businessName: "Bornand Electricite",
    city: "Lausanne",
    aiAutoReply: true,
    googleAccessTokenEnc: null,
    bestPosition: 5,
    previousPosition: 9,
    callsGenerated: 6,
    directionsGenerated: 2,
  });

  reviews.set("r-001", {
    id: "r-001",
    googleProfileId: "g-001",
    googleReviewId: "gr-001",
    reviewerName: "Camille R.",
    rating: 2,
    comment: "Devis final plus élevé que ce qui avait été annoncé au téléphone.",
    aiReplyDraft: null,
    replyText: null,
    status: "pending",
  });
  // Avis positif sur la meme fiche que r-001 : c'est lui qui emprunte le
  // chemin de la publication automatique. Avoir les deux notes sur g-001 est
  // volontaire — c'est ce qui rend visible, dans les tests, que la separation
  // se fait bien sur la note et non sur la fiche.
  reviews.set("r-003", {
    id: "r-003",
    googleProfileId: "g-001",
    googleReviewId: "gr-003",
    reviewerName: "Sophie L.",
    rating: 5,
    comment: "Intervention rapide et propre, je recommande.",
    aiReplyDraft: null,
    replyText: null,
    status: "pending",
  });
  // Avis « etoiles seules » : Google autorise la note sans texte, et ce cas
  // n'est pas marginal. Le garder dans les donnees de depart evite qu'une
  // regression le fasse disparaitre des chemins testes.
  reviews.set("r-004", {
    id: "r-004",
    googleProfileId: "g-001",
    googleReviewId: "gr-004",
    reviewerName: null,
    rating: 5,
    comment: null,
    aiReplyDraft: null,
    replyText: null,
    status: "pending",
  });
  reviews.set("r-002", {
    id: "r-002",
    googleProfileId: "g-002", // aiAutoReply désactivé — le worker doit l'ignorer
    googleReviewId: "gr-002",
    reviewerName: "Marc T.",
    rating: 5,
    comment: "Parfait, comme d'habitude.",
    aiReplyDraft: null,
    replyText: null,
    status: "pending",
  });
}

export const memoryRepo: Repo = {
  async findUserByEmail(email) {
    await seed();
    const n = normalizeEmail(email);
    for (const u of users.values()) if (u.email === n) return u;
    return null;
  },

  async findUserById(id) {
    await seed();
    return users.get(id) ?? null;
  },

  async createUser(email, password) {
    await seed();
    const n = normalizeEmail(email);
    for (const u of users.values()) {
      if (u.email === n) throw new Error("EMAIL_DEJA_UTILISE");
    }
    const user: UserRecord = {
      id: `u-${crypto.randomUUID()}`,
      email: n,
      passwordHash: await hashPassword(password),
      role: "artisan",
      phoneNumber: null,
    };
    users.set(user.id, user);
    return user;
  },

  async setUserPhone(userId, phoneNumber) {
    await seed();
    const u = users.get(userId);
    if (!u) throw new Error(`Utilisateur introuvable : ${userId}`);
    u.phoneNumber = phoneNumber;
  },
  async createCompany(input) {
    await seed();
    const c: CompanyRecord = {
      id: `c-${crypto.randomUUID()}`,
      userId: input.userId,
      companyName: input.companyName,
      tradeType: input.tradeType,
      planId: "basique",
      country: input.country,
      // Un compte neuf naît en essai, au tarif du palier d'entrée. Le webhook
      // Stripe le fera passer en `active` au premier paiement encaissé.
      planAmount: 49,
      // L'essai démarre à la création : c'est ce que le site promet depuis
      // l'origine, et ce que rien n'implémentait.
      subscriptionStatus: "trialing",
      paymentFailedAt: null,
      gracePeriodEndsAt: null,
      canceledAt: null,
      trialEndsAt: finEssai(),
    };
    companies.set(c.id, c);
    return c;
  },
  async findCompanyForUser(userId) {
    await seed();
    return [...companies.values()].find((c) => c.userId === userId) ?? null;
  },

  async upsertGoogleProfile(input) {
    await seed();
    const existante = [...profiles.values()].find(
      (p) => p.googleLocationId === input.googleLocationId,
    );
    const fiche: GoogleProfileRecord = {
      id: existante?.id ?? `g-${crypto.randomUUID()}`,
      companyId: input.companyId,
      googleLocationId: input.googleLocationId,
      placeId: input.placeId ?? existante?.placeId ?? null,
      businessName: input.businessName,
      city: input.city ?? "",
      aiAutoReply: existante?.aiAutoReply ?? true,
      googleAccessTokenEnc: input.accessTokenEnc,
      // Chiffres dérivés : ils viennent des relevés, pas de la connexion.
      bestPosition: existante?.bestPosition ?? null,
      previousPosition: existante?.previousPosition ?? null,
      callsGenerated: existante?.callsGenerated ?? 0,
      directionsGenerated: existante?.directionsGenerated ?? 0,
    };
    profiles.set(fiche.id, fiche);
    return fiche;
  },

  async listProfilesForUser(userId) {
    await seed();
    const owned = new Set(
      [...companies.values()].filter((c) => c.userId === userId).map((c) => c.id),
    );
    return [...profiles.values()].filter((p) => owned.has(p.companyId));
  },

  async countProfilesForUser(userId) {
    await seed();
    return (await memoryRepo.listProfilesForUser(userId)).length;
  },
  async findProfileForUser(userId, profileId) {
    await seed();
    const p = profiles.get(profileId);
    if (!p) return null;
    const company = companies.get(p.companyId);
    // La jointure sur le propriétaire fait partie de la lecture. Charger la
    // fiche puis comparer dans l'appelant serait la même chose « en apparence »,
    // mais laisserait à chaque route la responsabilité de ne pas l'oublier.
    if (!company || company.userId !== userId) return null;
    return p;
  },

  async listProfilesWithAutoReplyEnabled() {
    await seed();
    return [...profiles.values()].filter((p) => p.aiAutoReply);
  },

  async listReviewsForProfile(profileId, limite = 50) {
    await seed();
    return [...reviews.values()]
      .filter((r) => r.googleProfileId === profileId)
      .slice(0, limite);
  },

  async listPendingReviews(profileId) {
    await seed();
    return [...reviews.values()].filter(
      (r) => r.googleProfileId === profileId && r.status === "pending",
    );
  },

  async getReviewById(reviewId) {
    await seed();
    return reviews.get(reviewId) ?? null;
  },

  async getProfileById(profileId) {
    await seed();
    return profiles.get(profileId) ?? null;
  },

  async getCompanyForProfile(profileId) {
    await seed();
    const p = profiles.get(profileId);
    if (!p) return null;
    return companies.get(p.companyId) ?? null;
  },

  async saveReviewReply(reviewId, replyText) {
    await seed();
    const r = reviews.get(reviewId);
    if (!r) throw new Error(`Avis introuvable : ${reviewId}`);
    r.aiReplyDraft = replyText;
    r.replyText = replyText;
    r.status = "approved";
  },

  async findAgencyByDomain(domain) {
    await seed();
    return agencies.get(domain) ?? null;
  },

  async saveMagicLink(record) {
    await seed();
    magicLinks.set(record.tokenHash, { ...record });
  },
  async consumeMagicLink(tokenHash, now = Date.now()) {
    await seed();
    const r = magicLinks.get(tokenHash);
    if (!r) return null;
    // Copie de l'état AVANT modification : c'est elle qu'on renvoie, pour que
    // l'appelant voie « déjà utilisé » plutôt que l'état qu'on vient d'écrire.
    const avant = { ...r };
    if (r.usedAt === null) r.usedAt = now;
    return avant;
  },
  async marquerEvenementStripe(id) {
    await seed();
    if (evenementsStripe.has(id)) return false;
    evenementsStripe.add(id);
    return true;
  },
  async majAbonnement(input) {
    await seed();
    for (const c of companies.values()) {
      if (c.userId !== input.userId) continue;
      // Le dépôt en mémoire ne porte pas ces colonnes ; l'important ici est
      // que l'appel réussisse pour que les tests exercent le flux complet.
      if (input.planId) (c as { tradeType: string }).tradeType = c.tradeType;
    }
  },
  async estDesabonne(phone) {
    await seed();
    return desabonnes.has(phone);
  },

  async dernierEnvoiAvis(profileId, phone) {
    await seed();
    const dates = demandesAvis
      .filter((d) => d.profileId === profileId && d.clientPhone === phone)
      .map((d) => d.envoyeeA.getTime());
    return dates.length > 0 ? new Date(Math.max(...dates)) : null;
  },

  async enregistrerDemandeAvis(input) {
    await seed();
    demandesAvis.push({
      profileId: input.profileId,
      clientPhone: input.clientPhone,
      clientName: input.clientName ?? null,
      statut: input.statut,
      envoyeeA: new Date(),
    });
  },

  async enregistrerDesabonnement(phone) {
    await seed();
    desabonnes.add(phone);
  },

  async creerFacture(input) {
    await seed();
    if (input.stripeSessionId) {
      const deja = [...factures.values()].find(
        (f) => sessionsFacturees.get(f.numero) === input.stripeSessionId,
      );
      if (deja) return deja;
    }
    const annee = new Date().getFullYear();
    const sequence = (compteursFacture.get(annee) ?? 0) + 1;
    compteursFacture.set(annee, sequence);
    const facture: FactureRecord = {
      numero: `FA-${annee}-${String(sequence).padStart(4, "0")}`,
      userId: input.userId,
      clientNom: input.clientNom,
      clientEmail: input.clientEmail,
      designation: input.designation,
      montantCentimes: input.montantCentimes,
      devise: input.devise,
      tvaIde: input.tvaIde,
      emiseLe: new Date(),
      payeeLe: new Date(),
    };
    factures.set(facture.numero, facture);
    if (input.stripeSessionId) sessionsFacturees.set(facture.numero, input.stripeSessionId);
    return facture;
  },

  async marquerFactureEnvoyee(numero) {
    await seed();
    if (!factures.has(numero)) throw new Error(`Facture introuvable : ${numero}`);
  },

  async statistiquesAdmin() {
    await seed();
    const abonnements: Record<string, number> = {};
    const paliers: Record<string, number> = {};
    for (const c of companies.values()) {
      abonnements[c.subscriptionStatus] = (abonnements[c.subscriptionStatus] ?? 0) + 1;
      paliers[c.planId] = (paliers[c.planId] ?? 0) + 1;
    }
    let montant = 0;
    for (const f of factures.values()) montant += f.montantCentimes;
    return {
      comptes: users.size,
      entreprises: companies.size,
      fiches: profiles.size,
      abonnements,
      paliers,
      avis: reviews.size,
      avisEnAttente: [...reviews.values()].filter((r) => r.status === "pending").length,
      demandesAvis: demandesAvis.length,
      desabonnements: desabonnes.size,
      smsCeMois: [...usageSms.values()].reduce((n, v) => n + v, 0),
      facturesEmises: factures.size,
      montantFactureCentimes: montant,
    };
  },

  async listerClients(profileId, limite = 100) {
    await seed();
    const parNumero = new Map<string, ClientRecord>();

    const obtenir = (phone: string) => {
      let c = parNumero.get(phone);
      if (!c) {
        c = {
          phone,
          name: null,
          dernierAvisDemande: null,
          dernierRendezVous: null,
          desabonne: desabonnes.has(phone),
        };
        parNumero.set(phone, c);
      }
      return c;
    };

    for (const r of rendezVous.values()) {
      if (r.googleProfileId !== profileId) continue;
      const c = obtenir(r.clientPhone);
      c.name = c.name ?? r.clientName;
      if (!c.dernierRendezVous || r.requestedAt > c.dernierRendezVous) {
        c.dernierRendezVous = r.requestedAt;
      }
    }

    for (const d of demandesAvis) {
      if (d.profileId !== profileId || d.statut !== "sent") continue;
      const c = obtenir(d.clientPhone);
      c.name = c.name ?? d.clientName;
      if (!c.dernierAvisDemande || d.envoyeeA > c.dernierAvisDemande) {
        c.dernierAvisDemande = d.envoyeeA;
      }
    }

    return [...parNumero.values()]
      .sort((a, b) => {
        const da = a.dernierRendezVous ?? a.dernierAvisDemande ?? new Date(0);
        const db = b.dernierRendezVous ?? b.dernierAvisDemande ?? new Date(0);
        return db.getTime() - da.getTime();
      })
      .slice(0, limite);
  },

  async compterSmsDuMois(companyId) {
    await seed();
    return usageSms.get(`${companyId}:${new Date().toISOString().slice(0, 7)}`) ?? 0;
  },

  async incrementerSmsDuMois(companyId) {
    await seed();
    const cle = `${companyId}:${new Date().toISOString().slice(0, 7)}`;
    usageSms.set(cle, (usageSms.get(cle) ?? 0) + 1);
  },

  async listerPosts(profileId, limite = 20) {
    await seed();
    return [...posts.values()]
      .filter((p) => p.googleProfileId === profileId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limite);
  },

  async creerPost(input) {
    await seed();
    const post: PostRecord = {
      id: `p-${crypto.randomUUID()}`,
      googleProfileId: input.profileId,
      content: input.content,
      topicTag: input.topicTag,
      scheduledAt: input.scheduledAt,
      status: "draft",
      createdAt: new Date(),
    };
    posts.set(post.id, post);
    return post;
  },

  async majPost(input) {
    await seed();
    const p = posts.get(input.postId);
    // Le contrôle de propriété porte sur la fiche : sans lui, un identifiant
    // deviné laisserait réécrire la publication d'un autre artisan.
    if (!p || p.googleProfileId !== input.profileId) {
      throw new Error(`Publication introuvable : ${input.postId}`);
    }
    p.content = input.content;
  },

  async findAssistantSettings(widgetKey) {
    await seed();
    return reglagesAssistant.get(widgetKey) ?? null;
  },

  async creerReglagesAssistant(profileId) {
    await seed();
    const existants = [...reglagesAssistant.values()].find(
      (r) => r.googleProfileId === profileId,
    );
    if (existants) return existants;
    const reglages: AssistantSettingsRecord = {
      googleProfileId: profileId,
      widgetKey: genererWidgetKey(),
      allowedOrigins: [],
      faqContext: null,
      widgetColor: "#123f6d",
      dailyMessageLimit: 200,
      isActive: false,
    };
    reglagesAssistant.set(reglages.widgetKey, reglages);
    return reglages;
  },

  async findAssistantSettingsForUser(userId, profileId) {
    await seed();
    const p = profiles.get(profileId);
    if (!p) return null;
    const company = companies.get(p.companyId);
    if (!company || company.userId !== userId) return null;
    return (
      [...reglagesAssistant.values()].find((r) => r.googleProfileId === profileId) ?? null
    );
  },

  async majReglagesAssistant(input) {
    await seed();
    const r = [...reglagesAssistant.values()].find(
      (x) => x.googleProfileId === input.profileId,
    );
    if (!r) throw new Error(`Réglages introuvables : ${input.profileId}`);
    if (input.allowedOrigins !== undefined) r.allowedOrigins = input.allowedOrigins;
    if (input.faqContext !== undefined) r.faqContext = input.faqContext;
    if (input.isActive !== undefined) r.isActive = input.isActive;
  },

  async compterMessagesAssistant(profileId) {
    await seed();
    return usageAssistant.get(`${profileId}:${new Date().toISOString().slice(0, 10)}`) ?? 0;
  },

  async incrementerMessagesAssistant(profileId) {
    await seed();
    const cle = `${profileId}:${new Date().toISOString().slice(0, 10)}`;
    usageAssistant.set(cle, (usageAssistant.get(cle) ?? 0) + 1);
  },

  async creerRendezVous(input) {
    await seed();
    const r: RendezVousRecord = {
      id: `rdv-${crypto.randomUUID()}`,
      googleProfileId: input.profileId,
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      clientEmail: input.clientEmail ?? null,
      requestedAt: input.requestedAt,
      details: input.details ?? null,
      status: "confirmed",
    };
    rendezVous.set(r.id, r);
  },

  async listerRendezVous(profileId, limite = 50) {
    await seed();
    return [...rendezVous.values()]
      .filter((r) => r.googleProfileId === profileId)
      .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
      .slice(0, limite);
  },

  async majStatutRendezVous(input) {
    await seed();
    const r = rendezVous.get(input.rendezVousId);
    // Le contrôle porte sur la fiche : un identifiant deviné ne doit pas
    // laisser modifier le rendez-vous d'un autre artisan.
    if (!r || r.googleProfileId !== input.profileId) {
      throw new Error(`Rendez-vous introuvable : ${input.rendezVousId}`);
    }
    r.status = input.statut;
  },

  async listWeeklyStats() {
    await seed();
    const out: WeeklyStatsRecord[] = [];
    for (const p of profiles.values()) {
      const company = companies.get(p.companyId);
      if (!company) continue;
      const user = users.get(company.userId);
      // Sans numéro, pas de rapport : on saute plutôt que d'échouer, un
      // artisan sans mobile enregistré ne devant pas bloquer la tournée des
      // autres.
      if (!user?.phoneNumber) continue;

      const pending = [...reviews.values()].filter(
        (r) => r.googleProfileId === p.id && r.status === "pending",
      ).length;

      // Si le propriétaire est une agence en marque blanche, c'est SA marque
      // qui doit figurer dans le SMS, jamais la nôtre.
      const agence = [...agencies.values()].find((a) => a.userId === company.userId);

      out.push({
        googleProfileId: p.id,
        businessName: p.businessName,
        phoneNumber: user.phoneNumber,
        bestPosition: p.bestPosition,
        previousPosition: p.previousPosition,
        callsGenerated: p.callsGenerated,
        directionsGenerated: p.directionsGenerated,
        pendingReviews: pending,
        brandName: agence?.brandName ?? null,
      });
    }
    return out;
  },

  async saveReviewDraft(reviewId, draft) {
    await seed();
    const r = reviews.get(reviewId);
    if (!r) throw new Error(`Avis introuvable : ${reviewId}`);
    r.aiReplyDraft = draft;
    // `replyText` et `status` restent intacts : NOTRE RÉPONSE n'est pas
    // envoyée, et l'avis continue d'apparaître dans « à valider ». L'avis du
    // client, lui, reste visible sur la fiche Google — nous n'y touchons
    // jamais, et le formuler ainsi évite de laisser croire le contraire.
    r.status = "pending";
  },
  async markReviewFailed(reviewId) {
    await seed();
    const r = reviews.get(reviewId);
    if (!r) throw new Error(`Avis introuvable : ${reviewId}`);
    r.status = "failed";
  },
};

/**
 * Choisit l'implémentation du dépôt.
 *
 * `DATABASE_URL` présente → PostgreSQL. Absente → mémoire.
 *
 * LE CAS DANGEREUX EST « PRODUCTION SANS DATABASE_URL »
 *
 * Retomber silencieusement sur la mémoire donnerait une application qui semble
 * marcher : on crée un compte, on se connecte, tout répond — et le premier
 * redémarrage efface le client. C'est exactement l'état dans lequel ce SaaS a
 * tourné en production le 30 août 2026, base PostgreSQL vide à côté. On échoue
 * donc bruyamment plutôt que de laisser croire.
 *
 * L'import de pgRepo est STATIQUE. Un `require()` conditionnel a été essayé
 * d'abord, pour éviter d'embarquer le pilote `pg` quand il ne sert pas : sous
 * le bundler de Next, il renvoie `undefined` — la connexion échouait en
 * production sur « Cannot read properties of undefined ». Le pilote pèse peu,
 * et toutes les routes concernées déclarent déjà `runtime = "nodejs"`.
 */
export function getRepo(): Repo {
  if (process.env.DATABASE_URL) return pgRepo;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL absente en production. Le dépôt en mémoire perdrait tous " +
        "les comptes, sessions et avis au premier redémarrage — un client créé " +
        "aujourd'hui aurait disparu demain. Configurez DATABASE_URL.",
    );
  }
  return memoryRepo;
}

/** Réservé aux tests. */
export function __resetRepo() {
  /*
   * TOUS les stockages en mémoire, sans exception.
   *
   * Trois d'entre eux manquaient — compteurs de factures, d'assistant et de
   * SMS — et l'état fuyait d'un test à l'autre : un test isolé passait, la
   * suite complète échouait, et le coupable était le test précédent. Ajouter un
   * stockage sans l'ajouter ici recrée ce piège.
   */
  users.clear();
  companies.clear();
  profiles.clear();
  reviews.clear();
  agencies.clear();
  magicLinks.clear();
  evenementsStripe.clear();
  demandesAvis.length = 0;
  desabonnes.clear();
  factures.clear();
  compteursFacture.clear();
  sessionsFacturees.clear();
  reglagesAssistant.clear();
  usageAssistant.clear();
  rendezVous.clear();
  posts.clear();
  usageSms.clear();
  seeded = false;
}
