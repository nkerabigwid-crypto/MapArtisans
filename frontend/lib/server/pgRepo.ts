// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { Pool, type PoolClient } from "pg";
import { hashPassword } from "./password";
import type { MagicLinkRecord } from "./magicLink";
import type { AgencyBrandingRecord } from "./branding";
import type {
  AssistantSettingsRecord,
  PostRecord,
  FactureRecord,
  CompanyRecord,
  GoogleProfileRecord,
  Repo,
  ReviewRecord,
  UserRecord,
  WeeklyStatsRecord,
} from "./repo";
import { normalizeEmail } from "./repo";
import { genererWidgetKey } from "./assistant/access";

/**
 * Dépôt PostgreSQL — l'implémentation de production.
 *
 * Le dépôt en mémoire reste utilisé en développement et dans les tests ; c'est
 * l'interface `Repo` qui garantit que les deux sont interchangeables. Cette
 * séparation a été posée dès le départ précisément pour ce moment.
 *
 * DEUX RÈGLES QUE CE FICHIER DOIT TENIR
 *
 * 1. **Le filtre par propriétaire est DANS la requête.** `findProfileForUser`
 *    ne charge pas une fiche pour la comparer ensuite : la jointure elle-même
 *    exclut ce qui n'appartient pas à l'utilisateur. Une vérification faite
 *    après coup finit toujours par être oubliée dans une route.
 *
 * 2. **Aucune requête sans paramètre lié.** Toutes les valeurs passent par $1,
 *    $2… Une seule concaténation de chaîne suffirait à ouvrir une injection
 *    SQL sur une base qui contient les jetons Google de tous les clients.
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL absente. Aucun repli silencieux vers le dépôt en mémoire " +
        "n'est prévu : il donnerait une application qui semble fonctionner et " +
        "perd tout au premier redémarrage.",
    );
  }
  pool = new Pool({
    connectionString,
    // 10 connexions : au-delà, les deux workers et le serveur web épuiseraient
    // les 100 connexions par défaut de PostgreSQL sous charge.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

/** Ferme le pool. Utile aux tests, et à un arrêt propre des workers. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

async function q<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  client?: PoolClient,
): Promise<T[]> {
  const r = await (client ?? getPool()).query(sql, params);
  return r.rows as T[];
}

// --- Conversions ligne → enregistrement -------------------------------------
// Les colonnes sont en snake_case, les enregistrements en camelCase. La
// conversion est explicite plutôt qu'automatique : une correspondance devinée
// masque les écarts de schéma au lieu de les faire échouer visiblement.

/* eslint-disable @typescript-eslint/no-explicit-any */
function versUtilisateur(r: any): UserRecord {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    phoneNumber: r.phone_number ?? null,
  };
}

function versPost(r: any): PostRecord {
  return {
    id: r.id,
    googleProfileId: r.google_profile_id,
    content: r.content,
    topicTag: r.topic_tag ?? null,
    scheduledAt: r.scheduled_at,
    status: r.status,
    createdAt: r.created_at,
  };
}

function versReglagesAssistant(r: any): AssistantSettingsRecord {
  return {
    googleProfileId: r.google_profile_id,
    widgetKey: r.widget_key,
    // Champ texte séparé par des virgules en base. Filtré : une virgule finale
    // produirait une origine vide, qui correspondrait à un `Origin` absent.
    allowedOrigins: String(r.allowed_origins ?? "")
      .split(",")
      .map((o: string) => o.trim())
      .filter(Boolean),
    faqContext: r.faq_context ?? null,
    widgetColor: r.widget_color,
    dailyMessageLimit: Number(r.daily_message_limit),
    isActive: Boolean(r.is_active),
  };
}

function versFacture(r: any): FactureRecord {
  return {
    numero: r.numero,
    userId: r.user_id,
    clientNom: r.client_nom,
    clientEmail: r.client_email ?? null,
    designation: r.designation,
    montantCentimes: Number(r.montant_centimes),
    devise: r.devise,
    tvaIde: r.tva_ide ?? null,
    emiseLe: r.emise_le,
    payeeLe: r.payee_le ?? null,
  };
}

function versFiche(r: any): GoogleProfileRecord {
  return {
    id: r.id,
    companyId: r.company_id,
    googleLocationId: r.google_location_id,
    placeId: r.place_id ?? null,
    businessName: r.business_name,
    city: r.city ?? "",
    aiAutoReply: r.ai_auto_reply,
    googleAccessTokenEnc: r.google_access_token ?? null,
  } as GoogleProfileRecord;
}

function versEntreprise(r: any): CompanyRecord {
  return {
    id: r.id,
    userId: r.user_id,
    companyName: r.company_name,
    tradeType: r.trade_type ?? "",
    planId: r.plan_id ?? "essentiel",
  } as CompanyRecord;
}

function versAvis(r: any): ReviewRecord {
  return {
    id: r.id,
    googleProfileId: r.google_profile_id,
    googleReviewId: r.google_review_id,
    reviewerName: r.reviewer_name ?? null,
    rating: r.rating,
    comment: r.comment ?? null,
    aiReplyDraft: r.ai_reply_draft ?? null,
    replyText: r.reply_text ?? null,
    status: r.status,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const pgRepo: Repo = {
  async findUserByEmail(email) {
    const r = await q("SELECT * FROM users WHERE email = $1", [normalizeEmail(email)]);
    return r[0] ? versUtilisateur(r[0]) : null;
  },

  async findUserById(id) {
    const r = await q("SELECT * FROM users WHERE id = $1", [id]);
    return r[0] ? versUtilisateur(r[0]) : null;
  },

  async createUser(email, password) {
    const r = await q(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'artisan')
       RETURNING *`,
      [normalizeEmail(email), await hashPassword(password)],
    );
    return versUtilisateur(r[0]);
  },

  async setUserPhone(userId, phoneNumber) {
    const r = await q("UPDATE users SET phone_number = $2 WHERE id = $1 RETURNING id", [
      userId,
      phoneNumber,
    ]);
    if (r.length === 0) throw new Error(`Utilisateur introuvable : ${userId}`);
  },

  async createCompany(input) {
    // `country` et `currency` sont contraints en base (migrations 004 et 009) :
    // un pays hors liste ou une devise autre que CHF fait échouer l'insertion
    // plutôt que d'enregistrer une facturation impossible.
    const r = await q(
      `INSERT INTO companies (user_id, company_name, trade_type, country, currency, plan_id)
       VALUES ($1, $2, $3, $4, 'CHF', 'essentiel')
       RETURNING *`,
      [input.userId, input.companyName, input.tradeType, input.country],
    );
    return versEntreprise(r[0]);
  },

  async findCompanyForUser(userId) {
    const r = await q(
      "SELECT * FROM companies WHERE user_id = $1 ORDER BY created_at LIMIT 1",
      [userId],
    );
    return r[0] ? versEntreprise(r[0]) : null;
  },

  async upsertGoogleProfile(input) {
    // Le conflit porte sur google_location_id, qui est UNIQUE : reconnecter une
    // fiche met à jour l'existante au lieu d'en créer une seconde, et
    // l'historique d'avis rattaché reste en place.
    //
    // ai_auto_reply est volontairement ABSENT du SET : c'est un réglage de
    // l'artisan, et une reconnexion ne doit pas le remettre à sa valeur par
    // défaut, ce qui réactiverait des réponses qu'il avait coupées.
    //
    // Le jeton de rafraîchissement n'est écrasé que si Google en renvoie un :
    // il n'est émis qu'à la première autorisation, et COALESCE évite de
    // remplacer un jeton durable valide par NULL.
    const r = await q(
      `INSERT INTO google_profiles
         (company_id, google_location_id, place_id, business_name, address, city,
          latitude, longitude, google_access_token, google_refresh_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (google_location_id) DO UPDATE SET
         company_id           = EXCLUDED.company_id,
         -- COALESCE : Google ne publie pas toujours le Place ID sur une fiche
         -- récente. Une reconnexion ne doit pas effacer celui déjà obtenu, sans
         -- quoi les liens d'avis déjà imprimés en QR code cesseraient de viser.
         place_id             = COALESCE(EXCLUDED.place_id, google_profiles.place_id),
         business_name        = EXCLUDED.business_name,
         address              = EXCLUDED.address,
         city                 = EXCLUDED.city,
         latitude             = EXCLUDED.latitude,
         longitude            = EXCLUDED.longitude,
         google_access_token  = EXCLUDED.google_access_token,
         google_refresh_token = COALESCE(EXCLUDED.google_refresh_token,
                                         google_profiles.google_refresh_token)
       RETURNING *`,
      [
        input.companyId,
        input.googleLocationId,
        input.placeId,
        input.businessName,
        input.address,
        input.city,
        input.latitude,
        input.longitude,
        input.accessTokenEnc,
        input.refreshTokenEnc,
      ],
    );
    return versFiche(r[0]);
  },

  async listProfilesForUser(userId) {
    // La jointure porte le filtre : aucune fiche d'un autre utilisateur ne peut
    // remonter, même si l'appelant oublie de vérifier quoi que ce soit.
    const r = await q(
      `SELECT gp.* FROM google_profiles gp
       JOIN companies c ON c.id = gp.company_id
       WHERE c.user_id = $1
       ORDER BY gp.created_at`,
      [userId],
    );
    return r.map(versFiche);
  },

  async findProfileForUser(userId, profileId) {
    const r = await q(
      `SELECT gp.* FROM google_profiles gp
       JOIN companies c ON c.id = gp.company_id
       WHERE c.user_id = $1 AND gp.id = $2`,
      [userId, profileId],
    );
    return r[0] ? versFiche(r[0]) : null;
  },

  async countProfilesForUser(userId) {
    const r = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM google_profiles gp
       JOIN companies c ON c.id = gp.company_id
       WHERE c.user_id = $1`,
      [userId],
    );
    return Number(r[0].n);
  },

  async listProfilesWithAutoReplyEnabled() {
    const r = await q("SELECT * FROM google_profiles WHERE ai_auto_reply = true");
    return r.map(versFiche);
  },

  async listPendingReviews(profileId) {
    const r = await q(
      "SELECT * FROM reviews WHERE google_profile_id = $1 AND status = 'pending' ORDER BY created_at",
      [profileId],
    );
    return r.map(versAvis);
  },

  async getReviewById(reviewId) {
    const r = await q("SELECT * FROM reviews WHERE id = $1", [reviewId]);
    return r[0] ? versAvis(r[0]) : null;
  },

  async getProfileById(profileId) {
    const r = await q("SELECT * FROM google_profiles WHERE id = $1", [profileId]);
    return r[0] ? versFiche(r[0]) : null;
  },

  async getCompanyForProfile(profileId) {
    const r = await q(
      `SELECT c.* FROM companies c
       JOIN google_profiles gp ON gp.company_id = c.id
       WHERE gp.id = $1`,
      [profileId],
    );
    return r[0] ? versEntreprise(r[0]) : null;
  },

  async saveReviewReply(reviewId, replyText) {
    const r = await q(
      `UPDATE reviews SET ai_reply_draft = $2, reply_text = $2, status = 'approved'
       WHERE id = $1 RETURNING id`,
      [reviewId, replyText],
    );
    if (r.length === 0) throw new Error(`Avis introuvable : ${reviewId}`);
  },

  async saveReviewDraft(reviewId, draft) {
    // `reply_text` et `status` ne bougent pas : NOTRE RÉPONSE n'est pas
    // envoyée, et l'avis reste dans la file « à valider ». L'avis du client
    // reste visible sur sa fiche — nous ne masquons jamais un avis.
    const r = await q(
      `UPDATE reviews SET ai_reply_draft = $2, status = 'pending'
       WHERE id = $1 RETURNING id`,
      [reviewId, draft],
    );
    if (r.length === 0) throw new Error(`Avis introuvable : ${reviewId}`);
  },

  async markReviewFailed(reviewId) {
    const r = await q("UPDATE reviews SET status = 'failed' WHERE id = $1 RETURNING id", [reviewId]);
    if (r.length === 0) throw new Error(`Avis introuvable : ${reviewId}`);
  },

  async saveMagicLink(record) {
    await q(
      `INSERT INTO magic_links (token_hash, user_id, expires_at, used_at)
       VALUES ($1, $2, to_timestamp($3 / 1000.0), NULL)
       ON CONFLICT (token_hash) DO NOTHING`,
      [record.tokenHash, record.userId, record.expiresAt],
    );
  },

  async consumeMagicLink(tokenHash, now = Date.now()) {
    // UNE SEULE instruction, donc atomique. Les prévisualiseurs de lien (Gmail,
    // WhatsApp, Outlook) ouvrent les URL avant l'utilisateur : un test suivi
    // d'une écriture laisserait passer deux consommations du même jeton.
    //
    // La branche UPDATE renvoie `used_at = NULL` de façon explicite — c'est
    // l'état d'AVANT, celui que l'appelant doit voir pour conclure « valide ».
    const r = await q<{
      token_hash: string;
      user_id: string;
      expires_at: Date;
      used_at: Date | null;
    }>(
      `WITH maj AS (
         UPDATE magic_links SET used_at = to_timestamp($2 / 1000.0)
         WHERE token_hash = $1 AND used_at IS NULL
         RETURNING token_hash, user_id, expires_at
       )
       SELECT token_hash, user_id, expires_at, NULL::timestamptz AS used_at FROM maj
       UNION ALL
       SELECT token_hash, user_id, expires_at, used_at FROM magic_links
       WHERE token_hash = $1 AND NOT EXISTS (SELECT 1 FROM maj)`,
      [tokenHash, now],
    );
    if (!r[0]) return null;
    return {
      tokenHash: r[0].token_hash,
      userId: r[0].user_id,
      expiresAt: r[0].expires_at.getTime(),
      usedAt: r[0].used_at ? r[0].used_at.getTime() : null,
    } satisfies MagicLinkRecord;
  },

  async marquerEvenementStripe(id, type) {
    // ON CONFLICT DO NOTHING fait office de verrou : l'insertion réussit une
    // seule fois, quel que soit le nombre de rejeux simultanés. Un test suivi
    // d'une écriture laisserait passer deux traitements concurrents.
    const r = await q(
      `INSERT INTO stripe_events (id, type) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [id, type],
    );
    return r.length > 0;
  },

  async majAbonnement(input) {
    const champs: string[] = ["subscription_status = $2"];
    const valeurs: unknown[] = [input.userId, input.statut];
    if (input.stripeCustomerId) {
      valeurs.push(input.stripeCustomerId);
      champs.push(`stripe_customer_id = $${valeurs.length}`);
    }
    if (input.planId) {
      valeurs.push(input.planId);
      champs.push(`plan_id = $${valeurs.length}`);
    }
    // `payment_failed_at` est effacé au retour à l'état actif : le laisser
    // ferait afficher un bandeau d'impayé à un client qui a régularisé.
    if (input.statut === "active") champs.push("payment_failed_at = NULL");
    if (input.statut === "past_due") champs.push("payment_failed_at = now()");

    await q(`UPDATE companies SET ${champs.join(", ")} WHERE user_id = $1`, valeurs);
  },

  async estDesabonne(phone) {
    const r = await q("SELECT 1 FROM sms_optouts WHERE phone = $1", [phone]);
    return r.length > 0;
  },

  async dernierEnvoiAvis(profileId, phone) {
    // On ne retient que les envois RÉUSSIS : un échec technique n'a jamais
    // dérangé le client, il ne doit donc pas bloquer une nouvelle tentative
    // pendant trois mois.
    const r = await q<{ envoi: Date | null }>(
      `SELECT max(COALESCE(sent_at, created_at)) AS envoi
         FROM review_requests
        WHERE google_profile_id = $1 AND client_phone = $2 AND status = 'sent'`,
      [profileId, phone],
    );
    return r[0]?.envoi ?? null;
  },

  async enregistrerDemandeAvis(input) {
    await q(
      `INSERT INTO review_requests
         (google_profile_id, client_phone, client_name, status, sent_at, failure_reason)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'sent' THEN now() ELSE NULL END, $5)`,
      [
        input.profileId,
        input.clientPhone,
        input.clientName ?? null,
        input.statut,
        input.motifEchec ?? null,
      ],
    );
  },

  async enregistrerDesabonnement(phone, motif = "stop") {
    // ON CONFLICT DO NOTHING : un second STOP ne doit pas écraser la date du
    // premier, qui est la preuve de la date à laquelle le refus a été exprimé.
    await q(
      `INSERT INTO sms_optouts (phone, reason) VALUES ($1, $2)
       ON CONFLICT (phone) DO NOTHING`,
      [phone, motif],
    );
  },

  async creerFacture(input) {
    // Un webhook rejoué ne doit pas produire un second document. On regarde
    // AVANT d'incrémenter le compteur : sinon un rejeu consommerait un numéro
    // pour rien et creuserait un trou dans la série.
    if (input.stripeSessionId) {
      const deja = await q("SELECT * FROM invoices WHERE stripe_session_id = $1", [
        input.stripeSessionId,
      ]);
      if (deja[0]) return versFacture(deja[0]);
    }

    const annee = new Date().getFullYear();
    /*
     * UNE seule instruction, donc atomique. Le UPSERT sur invoice_counters
     * sérialise sur la clé primaire : deux paiements simultanés obtiennent deux
     * séquences distinctes, jamais la même. Un SELECT max()+1 suivi d'un INSERT
     * permettrait le doublon, et une série avec doublon est un problème
     * comptable, pas un détail d'implémentation.
     */
    const r = await q(
      `WITH compteur AS (
         INSERT INTO invoice_counters (annee, dernier) VALUES ($1, 1)
         ON CONFLICT (annee) DO UPDATE SET dernier = invoice_counters.dernier + 1
         RETURNING dernier
       )
       INSERT INTO invoices
         (numero, user_id, client_nom, client_email, designation,
          montant_centimes, devise, tva_ide, payee_le, stripe_session_id)
       SELECT
         'FA-' || $1::text || '-' || lpad(compteur.dernier::text, 4, '0'),
         $2, $3, $4, $5, $6, $7, $8, now(), $9
       FROM compteur
       RETURNING *`,
      [
        annee,
        input.userId,
        input.clientNom,
        input.clientEmail,
        input.designation,
        input.montantCentimes,
        input.devise,
        input.tvaIde,
        input.stripeSessionId,
      ],
    );
    return versFacture(r[0]);
  },

  async marquerFactureEnvoyee(numero) {
    const r = await q(
      "UPDATE invoices SET envoyee_le = now() WHERE numero = $1 RETURNING numero",
      [numero],
    );
    if (r.length === 0) throw new Error(`Facture introuvable : ${numero}`);
  },

  async listerPosts(profileId, limite = 20) {
    const r = await q(
      `SELECT * FROM posts WHERE google_profile_id = $1
        ORDER BY created_at DESC LIMIT $2`,
      [profileId, limite],
    );
    return r.map(versPost);
  },

  async creerPost(input) {
    const r = await q(
      `INSERT INTO posts (google_profile_id, content, topic_tag, scheduled_at, status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING *`,
      [input.profileId, input.content, input.topicTag, input.scheduledAt],
    );
    return versPost(r[0]);
  },

  async majPost(input) {
    // Le filtre sur google_profile_id est DANS la requête : un identifiant
    // deviné ne doit pas laisser réécrire la publication d'un autre artisan.
    const r = await q(
      `UPDATE posts SET content = $3
        WHERE id = $1 AND google_profile_id = $2
        RETURNING id`,
      [input.postId, input.profileId, input.content],
    );
    if (r.length === 0) throw new Error(`Publication introuvable : ${input.postId}`);
  },

  async findAssistantSettings(widgetKey) {
    const r = await q("SELECT * FROM assistant_settings WHERE widget_key = $1", [widgetKey]);
    return r[0] ? versReglagesAssistant(r[0]) : null;
  },

  async creerReglagesAssistant(profileId) {
    /*
     * DO NOTHING et non DO UPDATE : une reconnexion OAuth ne doit pas regénérer
     * la clé. Elle est collée dans le HTML du site de l'artisan — la changer
     * casserait son widget sans qu'il comprenne pourquoi.
     *
     * L'assistant naît désactivé, sans origine autorisée : tant que l'artisan
     * n'a pas déclaré son domaine, aucune requête ne peut consommer son budget.
     */
    await q(
      `INSERT INTO assistant_settings (google_profile_id, widget_key, allowed_origins, is_active)
       VALUES ($1, $2, '', false)
       ON CONFLICT (google_profile_id) DO NOTHING`,
      [profileId, genererWidgetKey()],
    );
    const r = await q("SELECT * FROM assistant_settings WHERE google_profile_id = $1", [
      profileId,
    ]);
    return versReglagesAssistant(r[0]);
  },

  async findAssistantSettingsForUser(userId, profileId) {
    // Le filtre de propriété est DANS la requête : la clé de widget ne doit
    // jamais pouvoir être lue par un autre utilisateur.
    const r = await q(
      `SELECT a.* FROM assistant_settings a
         JOIN google_profiles gp ON gp.id = a.google_profile_id
         JOIN companies c ON c.id = gp.company_id
        WHERE c.user_id = $1 AND a.google_profile_id = $2`,
      [userId, profileId],
    );
    return r[0] ? versReglagesAssistant(r[0]) : null;
  },

  async majReglagesAssistant(input) {
    const champs: string[] = [];
    const valeurs: unknown[] = [input.profileId];
    if (input.allowedOrigins !== undefined) {
      valeurs.push(input.allowedOrigins.join(","));
      champs.push(`allowed_origins = $${valeurs.length}`);
    }
    if (input.faqContext !== undefined) {
      valeurs.push(input.faqContext);
      champs.push(`faq_context = $${valeurs.length}`);
    }
    if (input.isActive !== undefined) {
      valeurs.push(input.isActive);
      champs.push(`is_active = $${valeurs.length}`);
    }
    if (champs.length === 0) return;
    const r = await q(
      `UPDATE assistant_settings SET ${champs.join(", ")}
        WHERE google_profile_id = $1 RETURNING google_profile_id`,
      valeurs,
    );
    if (r.length === 0) throw new Error(`Réglages introuvables : ${input.profileId}`);
  },

  async compterMessagesAssistant(profileId) {
    const r = await q<{ messages: string }>(
      `SELECT messages::text AS messages FROM assistant_usage
        WHERE google_profile_id = $1 AND jour = current_date`,
      [profileId],
    );
    return r[0] ? Number(r[0].messages) : 0;
  },

  async incrementerMessagesAssistant(profileId) {
    // UPSERT : la première requête du jour crée la ligne, les suivantes
    // l'incrémentent. Un SELECT suivi d'un INSERT échouerait sur la clé
    // primaire dès deux visiteurs simultanés.
    await q(
      `INSERT INTO assistant_usage (google_profile_id, jour, messages)
       VALUES ($1, current_date, 1)
       ON CONFLICT (google_profile_id, jour)
       DO UPDATE SET messages = assistant_usage.messages + 1`,
      [profileId],
    );
  },

  async creerRendezVous(input) {
    await q(
      `INSERT INTO appointments
         (google_profile_id, client_name, client_phone, client_email, requested_at, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.profileId,
        input.clientName,
        input.clientPhone,
        input.clientEmail ?? null,
        input.requestedAt,
        input.details ?? null,
      ],
    );
  },

  async listWeeklyStats() {
    // Une seule requête plutôt qu'une boucle avec N requêtes : la tournée
    // hebdomadaire parcourt tout le parc, et le coût d'un aller-retour par
    // fiche deviendrait la partie la plus lente du worker.
    //
    // La jointure sur agency_settings porte la marque blanche : si le
    // propriétaire est une agence, c'est SA marque qui part dans le SMS.
    const r = await q<Record<string, unknown>>(
      `SELECT
         gp.id                        AS google_profile_id,
         gp.business_name,
         u.phone_number,
         rt.grid_points,
         COALESCE(rt.calls_generated, 0)      AS calls_generated,
         COALESCE(rt.directions_generated, 0) AS directions_generated,
         (SELECT count(*) FROM reviews r
           WHERE r.google_profile_id = gp.id AND r.status = 'pending') AS pending_reviews,
         a.brand_name
       FROM google_profiles gp
       JOIN companies c ON c.id = gp.company_id
       JOIN users u     ON u.id = c.user_id
       LEFT JOIN agency_settings a ON a.user_id = c.user_id
       LEFT JOIN LATERAL (
         SELECT * FROM rank_trackings t
         WHERE t.google_profile_id = gp.id
         ORDER BY t.tracked_at DESC LIMIT 1
       ) rt ON true
       -- Sans numéro, pas de rapport : on écarte plutôt que d'échouer, un
       -- artisan sans mobile ne devant pas bloquer la tournée des autres.
       WHERE u.phone_number IS NOT NULL AND u.phone_number <> ''`,
    );

    return r.map((row) => {
      // grid_points est un JSONB : la meilleure position est la plus petite
      // valeur non nulle relevée sur la grille.
      const points = (row.grid_points ?? []) as Array<{ position: number | null }>;
      const positions = Array.isArray(points)
        ? points.map((p) => p?.position).filter((p): p is number => typeof p === "number")
        : [];
      return {
        googleProfileId: row.google_profile_id,
        businessName: row.business_name,
        phoneNumber: row.phone_number,
        bestPosition: positions.length ? Math.min(...positions) : null,
        // La semaine précédente demanderait un second relevé : à brancher quand
        // l'historique existera. `null` fait simplement disparaître l'évolution
        // du SMS, ce que composeWeeklyReport sait gérer.
        previousPosition: null,
        callsGenerated: Number(row.calls_generated),
        directionsGenerated: Number(row.directions_generated),
        pendingReviews: Number(row.pending_reviews),
        brandName: (row.brand_name as string | null) ?? null,
      } as WeeklyStatsRecord;
    });
  },

  async findAgencyByDomain(domain) {
    const r = await q("SELECT * FROM agency_settings WHERE custom_domain = $1", [domain]);
    if (!r[0]) return null;
    const a = r[0] as Record<string, unknown>;
    return {
      customDomain: a.custom_domain,
      brandName: a.brand_name ?? null,
      logoUrl: a.logo_url ?? null,
      primaryColor: a.primary_color,
      supportEmail: a.support_email ?? null,
    } as AgencyBrandingRecord;
  },
};
