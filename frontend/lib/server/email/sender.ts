// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.

/**
 * Envoi d'e-mails.
 *
 * MÊME ARCHITECTURE QUE LE SMS, POUR LA MÊME RAISON
 *
 * Une interface, une implémentation, et un refus explicite quand rien n'est
 * configuré. Changer de fournisseur — Resend, Postmark, un SMTP — ne demande
 * qu'une nouvelle implémentation de `EmailSender` : ni le worker, ni les
 * gabarits, ni les tests ne bougent.
 *
 * POURQUOI L'ÉCHEC EST BRUYANT
 *
 * Un e-mail de bienvenue avalé en silence, c'est un client qui a payé, n'a
 * jamais reçu son lien de connexion, et n'a aucun moyen de comprendre. Il ne
 * réessaiera pas : il demandera un remboursement.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Pièces jointes, pour la facture. */
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Implémentation par défaut : refuse et explique.
 *
 * Volontairement pas un « no-op » silencieux. Un envoi qui ne part pas doit se
 * voir dans les journaux, pas se découvrir par un client mécontent.
 */
export const notConfiguredSender: EmailSender = {
  async send(message) {
    throw new Error(
      `Envoi d'e-mail impossible vers ${message.to} : aucun fournisseur configuré. ` +
        "Renseignez RESEND_API_KEY et EMAIL_FROM. " +
        "Aucun repli silencieux n'est prévu — un e-mail de bienvenue avalé sans bruit " +
        "laisse un client qui a payé sans aucun moyen de se connecter.",
    );
  },
};

/**
 * Vérifie qu'une adresse d'expédition est utilisable.
 *
 * Refuse les `no-reply@` : nos e-mails invitent explicitement à répondre
 * (« Répondez simplement à ce message »). Expédier depuis une adresse qui
 * rejette les réponses ferait mentir le message dès le premier client qui
 * essaie.
 */
export function validerExpediteur(from: string): { ok: true } | { ok: false; raison: string } {
  const adresse = from.match(/<([^>]+)>/)?.[1] ?? from;
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(adresse.trim())) {
    return { ok: false, raison: `Adresse d'expédition invalide : « ${from} »` };
  }
  if (/^(no-?reply|ne-?pas-?repondre|donotreply)@/i.test(adresse.trim())) {
    return {
      ok: false,
      raison:
        "Adresse en « no-reply » refusée : nos e-mails invitent à répondre, " +
        "et une adresse qui rejette les réponses ferait mentir le message.",
    };
  }
  return { ok: true };
}

/**
 * Implémentation Resend.
 *
 * Choisi pour une raison précise : son API accepte texte, HTML et pièces
 * jointes en une seule requête JSON, sans dépendance à installer. La facture
 * PDF part donc avec l'e-mail de bienvenue sans traitement particulier.
 */
export function createResendSender(config: { apiKey: string; from: string }): EmailSender {
  const expediteur = validerExpediteur(config.from);
  if (!expediteur.ok) throw new Error(expediteur.raison);

  return {
    async send(message) {
      const corps: Record<string, unknown> = {
        from: config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      };

      if (message.attachments?.length) {
        corps.attachments = message.attachments.map((p) => ({
          filename: p.filename,
          content: p.content.toString("base64"),
        }));
      }

      const reponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(corps),
      });

      if (!reponse.ok) {
        const detail = await reponse.text().catch(() => "");
        // Le corps de la réponse est repris : Resend y explique précisément ce
        // qui bloque — domaine non vérifié, quota, adresse invalide. Le
        // masquer obligerait à deviner.
        throw new Error(
          `Envoi refusé (${reponse.status}) vers ${message.to} : ${detail.slice(0, 300)}`,
        );
      }
    },
  };
}

/**
 * Résout l'expéditeur depuis l'environnement.
 *
 * Retombe sur `notConfiguredSender` plutôt que de lever ici : le module doit
 * pouvoir être importé sans configuration, sinon les tests et le
 * développement local exigeraient une clé.
 */
export function resolveEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return notConfiguredSender;
  return createResendSender({ apiKey, from });
}
