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

export interface CompanyRecord {
  id: string;
  userId: string;
  companyName: string;
  tradeType: string;
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
  users.clear();
  companies.clear();
  profiles.clear();
  reviews.clear();
  agencies.clear();
  magicLinks.clear();
  evenementsStripe.clear();
  seeded = false;
}
