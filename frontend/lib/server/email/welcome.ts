// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.

/**
 * E-mail de bienvenue — le seul canal qui porte le lien magique.
 *
 * Pourquoi l'e-mail et pas le SMS : voir sms/welcome.ts. En résumé, l'adresse
 * est corroborée par le paiement Stripe ; le numéro de portable ne l'est pas.
 *
 * TROIS RÈGLES DE RÉDACTION, ET LEURS RAISONS
 *
 * 1. **La durée de validité est écrite dans le message.** Sans elle, l'artisan
 *    qui ouvre son e-mail le lendemain croit que le service est cassé et
 *    appelle le support. Avec elle, il sait qu'il doit en redemander un.
 *
 * 2. **Aucune image, aucun suivi d'ouverture.** Un pixel de tracking ou un logo
 *    distant chargé depuis la page transmet l'URL au serveur d'images — donc
 *    potentiellement le jeton. Le message est en texte et en HTML sobre, sans
 *    ressource externe.
 *
 * 3. **Le lien apparaît en clair, pas seulement derrière un bouton.** Les
 *    clients mail d'entreprise réécrivent les href pour les analyser ; quand la
 *    réécriture casse, l'artisan doit pouvoir copier l'adresse à la main.
 */

export interface WelcomeEmailData {
  /** URL complète produite par `magicLinkUrl()`. */
  magicLink: string;
  /** Marque affichée. `null` pour un client direct ; le nom de l'agence sinon. */
  brandName?: string | null;
  /** Durée de validité en minutes, pour rester cohérent avec magicLink.ts. */
  validiteMinutes?: number;
}

export interface WelcomeEmail {
  subject: string;
  text: string;
  html: string;
}

/** Échappe le texte inséré dans le HTML : une marque d'agence vient de la base. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function composeWelcomeEmail(data: WelcomeEmailData): WelcomeEmail {
  const marque = data.brandName?.trim() || "MapArtisans";
  const minutes = data.validiteMinutes ?? 15;
  const lien = data.magicLink;

  const subject = `${marque} — votre accès est prêt`;

  const text = [
    `Bienvenue sur ${marque}.`,
    "",
    "Votre compte est actif. Cliquez sur ce lien pour vous connecter,",
    "sans mot de passe à retenir :",
    "",
    lien,
    "",
    `Ce lien est valable ${minutes} minutes et ne fonctionne qu'une seule fois.`,
    "Passé ce délai, demandez-en un nouveau depuis la page de connexion.",
    "",
    "Une fois connecté, une seule étape reste : autoriser l'accès à votre",
    "fiche Google. Comptez une minute.",
    "",
    "Une question ? Répondez simplement à ce message, une personne vous lira.",
    "",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message :",
    "sans clic de votre part, rien ne se passe.",
    "",
    `— ${marque}`,
  ].join("\n");

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1a1d1a;max-width:520px">',
    `<p>Bienvenue sur <strong>${esc(marque)}</strong>.</p>`,
    "<p>Votre compte est actif. Cliquez pour vous connecter, sans mot de passe à retenir :</p>",
    `<p><a href="${esc(lien)}" style="display:inline-block;background:#123f6d;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Ouvrir mon tableau de bord</a></p>`,
    // Le lien en clair, pour le cas où la réécriture d'un client mail d'entreprise
    // casse le bouton. Voir la règle 3 en tête de fichier.
    `<p style="font-size:13px;color:#6a6f69">Si le bouton ne fonctionne pas, copiez cette adresse :<br><span style="word-break:break-all">${esc(lien)}</span></p>`,
    `<p style="font-size:13px;color:#6a6f69">Ce lien est valable ${minutes} minutes et ne fonctionne qu'une seule fois.</p>`,
    "<p>Une fois connecté, une seule étape reste : autoriser l'accès à votre fiche Google. Comptez une minute.</p>",
    // Repris d'une proposition de l'utilisateur : c'est la ligne qui coûte le
    // moins cher et rassure le plus. Elle suppose que l'adresse d'expédition
    // accepte les réponses — surtout pas un `no-reply@`, qui ferait mentir le
    // message dès le premier client qui essaie.
    "<p>Une question ? Répondez simplement à ce message, une personne vous lira.</p>",
    "<p style=\"font-size:13px;color:#6a6f69\">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : sans clic de votre part, rien ne se passe.</p>",
    `<p style="font-size:13px;color:#6a6f69">— ${esc(marque)}</p>`,
    "</div>",
  ].join("\n");

  return { subject, text, html };
}
