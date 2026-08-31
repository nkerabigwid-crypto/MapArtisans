// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans openai.ts.
import OpenAI from "openai";
import { classifyOpenAiError } from "./openai";
import { resolveTradeOrDefault } from "@/lib/trades";

/**
 * Génération des publications Google Business Profile.
 *
 * CE QUE CES POSTS FONT, ET CE QU'ILS NE FONT PAS
 *
 * Ils n'améliorent pas le classement. Google documente trois critères de
 * positionnement local — pertinence, distance, notoriété — et la fréquence de
 * publication n'en fait pas partie. Le prompt ci-dessous ne cherche donc pas à
 * « optimiser le référencement » : ce serait courir après un effet inexistant,
 * au prix d'un texte bourré de mots-clés que personne ne lit.
 *
 * Ce qu'ils font réellement : occuper la fiche. Un visiteur qui hésite entre
 * deux plombiers voit d'un côté une fiche vivante, de l'autre une fiche muette
 * depuis deux ans. C'est un argument de conversion, pas de classement — et
 * c'est déjà beaucoup.
 *
 * D'où la consigne d'écrire pour un humain qui choisit, jamais pour un robot.
 */

/**
 * Limite de Google pour une publication : 1 500 caractères.
 *
 * On vise beaucoup plus court. Un post lu sur un téléphone, entre deux
 * interventions, dépasse rarement l'écran — et une publication tronquée par
 * Google donne l'impression d'un texte bâclé.
 */
export const LONGUEUR_MAX = 700;

/** Sujets proposés à l'artisan. Le modèle ne les invente pas. */
export const SUJETS = [
  { tag: "intervention", libelle: "Une intervention récente, racontée sans nommer le client" },
  { tag: "conseil", libelle: "Un conseil d'entretien ou de prévention" },
  { tag: "saison", libelle: "Un rappel de saison (gel, chaleur, rentrée)" },
  { tag: "urgence", libelle: "Rappel de la disponibilité en urgence" },
  { tag: "zone", libelle: "Les communes desservies" },
] as const;

export type SujetPost = (typeof SUJETS)[number]["tag"];

export interface ContextePost {
  businessName: string;
  city: string;
  tradeType: string;
  sujet: SujetPost;
  /** Précisions de l'artisan : « chaudière à Sierre », « fermé le 12 ». */
  precisions?: string | null;
}

export interface PostGenerator {
  generate(ctx: ContextePost): Promise<string>;
}

export function buildPostPrompt(ctx: ContextePost): { system: string; user: string } {
  const metier = resolveTradeOrDefault(ctx.tradeType);
  const sujet = SUJETS.find((s) => s.tag === ctx.sujet) ?? SUJETS[0];

  const system = [
    `Tu rédiges une publication pour la fiche Google d'un ${metier.label} à ${ctx.city}.`,
    "",
    "RÈGLES ABSOLUES",
    `- ${LONGUEUR_MAX} caractères maximum. Vise 400.`,
    "- Écris pour un habitant qui hésite entre deux artisans, jamais pour un moteur de recherche.",
    // Le bourrage de mots-clés est le réflexe du modèle sur ce type de demande.
    // Il produit un texte que personne ne lit et que Google peut sanctionner.
    "- N'accumule PAS les mots-clés. Le nom du métier et de la ville apparaissent une fois chacun, au plus.",
    "- Aucun prix, aucun délai, aucune promesse d'intervention chiffrée.",
    "- Ne cite jamais un client, un nom, une adresse.",
    "- Pas de superlatif publicitaire (« le meilleur », « n° 1 », « imbattable »).",
    "- Français de Suisse romande, vouvoiement, ton direct et concret.",
    "- Pas de dièse, pas d'émoji, pas de titre en majuscules.",
    "",
    `Vocabulaire du métier : ${metier.lexique}.`,
    "",
    "Termine par une phrase qui invite à appeler, sans point d'exclamation.",
  ].join("\n");

  const user = [
    `Entreprise : ${ctx.businessName}`,
    `Ville : ${ctx.city}`,
    `Sujet : ${sujet.libelle}`,
    ctx.precisions?.trim() ? `Précisions de l'artisan : ${ctx.precisions.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

/**
 * Coupe proprement un texte trop long.
 *
 * Le modèle dépasse parfois la consigne. Tronquer au caractère produirait un
 * mot coupé en deux ; on recule jusqu'à la fin de phrase précédente.
 */
export function tronquerPost(texte: string, max = LONGUEUR_MAX): string {
  const propre = texte.trim();
  if (propre.length <= max) return propre;
  const coupe = propre.slice(0, max);
  const fin = Math.max(coupe.lastIndexOf("."), coupe.lastIndexOf("!"), coupe.lastIndexOf("?"));
  return fin > max * 0.5 ? coupe.slice(0, fin + 1) : `${coupe.trimEnd()}…`;
}

export const openAiPostGenerator: PostGenerator = {
  async generate(ctx) {
    const cle = process.env.OPENAI_API_KEY;
    if (!cle) throw new Error("OPENAI_API_KEY absente.");
    const { system, user } = buildPostPrompt(ctx);
    try {
      const client = new OpenAI({ apiKey: cle });
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // 700 caractères ≈ 250 tokens. La marge absorbe les dépassements sans
        // laisser le modèle partir sur un article de blog.
        max_tokens: 320,
        // Plus haut que pour les réponses aux avis : quatre publications de
        // suite ne doivent pas se ressembler.
        temperature: 0.8,
      });
      const texte = completion.choices[0]?.message?.content?.trim();
      if (!texte) throw new Error("Réponse vide du modèle.");
      return tronquerPost(texte);
    } catch (err) {
      classifyOpenAiError(err);
    }
  },
};
