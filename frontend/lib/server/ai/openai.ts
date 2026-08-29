// PAS de `import "server-only"` ici, volontairement : ce module est aussi
// importé par workers/reviewWorker.ts, qui tourne comme un processus Node
// autonome, hors du bundler de Next. Le paquet `server-only` lève de façon
// INCONDITIONNELLE dès qu'il est chargé ailleurs que sous le bundler de Next
// (c'est ce dernier, et lui seul, qui sait le neutraliser) — l'ajouter ici
// ferait planter le worker au démarrage. La frontière réelle est déjà tenue
// autrement : rien sous lib/server/ n'est importé par un composant "use
// client" (vérifié), et chaque route Next qui l'utilise déclare elle-même
// `export const runtime = "nodejs"`.
import OpenAI from "openai";
import { RetryableError, withBackoff } from "@/lib/server/resilience";
import { estAvisPositif } from "@/lib/server/reviewPolicy";

/**
 * Génération des réponses aux avis — service OpenAI.
 *
 * Ce fichier n'est PAS vérifié de bout en bout dans cet environnement : aucune
 * clé OPENAI_API_KEY n'y est configurée. Ce qui EST vérifié (voir
 * lib/server/queue/__tests__) : le pipeline complet — file, worker, transition
 * de statut, retries — via une implémentation injectée qui respecte la même
 * interface `ReplyGenerator`. Le jour où une clé existe, brancher ce fichier
 * ne demande de changer aucune autre pièce.
 */

export interface ReviewContext {
  reviewerName: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  /** `null` ou vide pour un avis noté sans texte — cas courant, pas une erreur. */
  comment: string | null;
  /** Métier de l'artisan — conditionne le vocabulaire et les mots-clés locaux. */
  tradeType: string;
  /** Ville ou zone d'intervention — c'est ce qui rend la réponse « locale ». */
  city: string;
  businessName: string;
}

export interface ReplyGenerator {
  generateReply(context: ReviewContext): Promise<string>;
}

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY absente. Aucun repli silencieux n'est prévu : une réponse " +
        "générée sans clé configurée serait soit un texte factice publié à la " +
        "place de l'artisan, soit une erreur avalée qui laisse l'avis bloqué " +
        "sans explication. Ni l'un ni l'autre n'est acceptable.",
    );
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

/**
 * Prompt structuré pour le marché francophone.
 *
 * Le métier et la ville sont injectés explicitement plutôt que laissés à
 * déduire du commentaire : un avis très court (« Nickel, merci ! ») ne contient
 * souvent ni l'un ni l'autre, et c'est justement là que l'ancrage local du
 * commentaire de réponse joue le plus pour Google — il ne peut donc pas
 * dépendre de ce que l'avis choisit de mentionner.
 */
/**
 * Construit le prompt. Exportée pour les tests : c'est le seul moyen de
 * vérifier que la branche négative ne demande AUCUN ancrage local, sans
 * dépendre d'un appel réseau ni de l'humeur du modèle.
 *
 * POURQUOI DEUX BRANCHES, ET NON UNE RÈGLE CONDITIONNELLE DANS LE TEXTE
 *
 * On pourrait écrire dans un prompt unique « mentionne le métier et la ville »
 * puis, plus bas, « sauf si la note est basse ». Un modèle arbitre mal deux
 * consignes contradictoires : il tranche différemment d'un appel à l'autre, et
 * l'échec est silencieux — personne ne voit passer le « plombier à Lausanne »
 * glissé sous un avis à 2 étoiles avant que Google ne l'ait indexé.
 *
 * La branche est donc choisie ICI, en TypeScript. Le prompt négatif ne contient
 * pas la consigne SEO : le modèle n'a rien à arbitrer.
 */
export function buildPrompt(ctx: ReviewContext): { system: string; user: string } {
  const positif = estAvisPositif(ctx.rating);

  const communes = [
    "Tu rédiges, au nom d'un artisan, la réponse publique à un avis Google.",
    "Règles strictes :",
    "- Français. Deux à quatre phrases, jamais davantage.",
    "- Jamais de promesse de résultat, de délai, ni de remise.",
    "- N'invente aucun détail absent de l'avis (date, montant, nom d'employé).",
    // Le nom de l'éditeur n'a rien à faire dans une réponse publique : en
    // marque blanche, l'artisan passé par une agence ne doit jamais voir
    // remonter le nom de l'outil, ni celui de son fournisseur.
    "- Ne cite jamais le nom d'un logiciel, d'un outil ou d'un prestataire.",
  ];

  const specifiques = positif
    ? [
        "- Ton chaleureux et reconnaissant, jamais obséquieux.",
        `- Mentionne naturellement le métier (${ctx.tradeType}) et la ville (${ctx.city})`,
        "  quand la phrase le porte sans sonner artificielle — c'est ce qui aide la",
        "  fiche à ressortir sur les recherches locales, pas un mot-clé plaqué.",
        "- Si le client n'a laissé qu'une note sans texte, remercie pour la note sans",
        "  jamais faire allusion a une prestation, un probleme ou un propos precis :",
        "  tu ne sais rien de son intervention, seulement combien d'etoiles il a mises.",
        `- Si tu signes, écris « L'équipe de ${ctx.businessName} », jamais autre chose.`,
      ]
    : [
        "- Ton mesuré et sobre. Ne te justifie pas, ne discute aucun fait, ne mets",
        "  jamais en doute la parole du client, même si tu le crois de mauvaise foi.",
        "- Reconnais la gêne et invite à poursuivre en privé, sans inventer ni",
        "  numéro de téléphone ni adresse e-mail.",
        // La règle qui compte, et la raison d'être de cette branche.
        `- N'écris NI le métier (${ctx.tradeType}) NI la ville (${ctx.city}). N'emploie`,
        "  aucun terme de recherche locale. Google indexe la réponse du gérant avec",
        "  l'avis : y placer les mots-clés du métier reviendrait à renforcer la",
        "  visibilité de la fiche sur une critique publique.",
        // Mesuré : sans cette ligne, le modèle signait « L'équipe de Plomberie
        // Dubois » — la raison sociale contient elle-même le mot-clé métier, ce
        // qui réintroduisait par la signature ce que la règle ci-dessus retire
        // du corps du texte. Google affiche déjà « Réponse du propriétaire ».
        "- Ne signe pas et n'écris pas la raison sociale : la réponse s'affiche",
        "  déjà sous le nom de l'entreprise sur Google.",
      ];

  const system = [...communes, ...specifiques].join("\n");

  const user = [
    // La ville et le métier restent dans le contexte factuel, y compris en
    // branche négative : le modèle doit savoir de quelle entreprise il parle
    // pour ne pas se tromper de registre. La consigne ci-dessus lui interdit
    // de les écrire, elle ne les lui cache pas.
    `Entreprise : ${ctx.businessName} (${ctx.tradeType}, ${ctx.city})`,
    `Client : ${ctx.reviewerName ?? "anonyme"}`,
    `Note : ${ctx.rating}/5`,
    // Un avis sans texte est annoncé comme tel. Passer `Avis : ""` laisserait le
    // modèle combler le vide plutôt que constater l'absence.
    ctx.comment?.trim()
      ? `Avis : "${ctx.comment.trim()}"`
      : "Avis : aucun texte, le client a laisse une note seule.",
    "",
    "Rédige uniquement la réponse, sans guillemets ni préambule.",
  ].join("\n");

  return { system, user };
}


/**
 * Traduit une erreur du SDK OpenAI vers le vocabulaire de `withBackoff` — lève
 * `RetryableError` pour ce qui est transitoire, relève l'erreur telle quelle
 * sinon. Extraite pour être testée sans clé API réelle : `OpenAI.APIError`
 * s'instancie via sa fabrique statique `.generate()`, ce qui permet de
 * reproduire exactement la forme d'une vraie réponse d'erreur.
 *
 * OpenAI surcharge le code 429 : il sert à la fois la limitation de débit
 * (transitoire — rejouer a du sens) et l'épuisement du crédit du compte
 * (permanent tant que personne n'ajoute de moyen de paiement — rejouer ne
 * fait que gaspiller du temps). Trouvé en testant contre un vrai compte à
 * crédit épuisé : sans cette distinction, chaque avis en file passait par
 * ~20 secondes de rejeu à délai exponentiel pour un problème qu'aucun rejeu
 * ne résout jamais.
 */
export function classifyOpenAiError(err: unknown): never {
  if (err instanceof OpenAI.APIError) {
    const status = err.status;
    const quotaExhausted = err.type === "insufficient_quota";
    if (!quotaExhausted && (status === 429 || (status && status >= 500))) {
      const retryAfterHeader = err.headers?.get?.("retry-after");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
      throw new RetryableError(err.message, status, retryAfterMs);
    }
  }
  throw err;
}

export const openAiReplyGenerator: ReplyGenerator = {
  async generateReply(context) {
    const { system, user } = buildPrompt(context);
    const client = getClient();

    return withBackoff(async () => {
      try {
        const completion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 220,
          temperature: 0.6,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        const text = completion.choices[0]?.message?.content?.trim();
        if (!text) throw new Error("Réponse vide renvoyée par le modèle.");
        return text;
      } catch (err) {
        // Cette frontière, et elle seule, doit savoir que le fournisseur est
        // OpenAI. Le reste du pipeline (worker, file, tests) ne dépend que de
        // l'interface ReplyGenerator.
        classifyOpenAiError(err);
      }
    });
  },
};
