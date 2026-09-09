// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import OpenAI from "openai";
import { classifyOpenAiError } from "@/lib/server/ai/openai";
import { SUJETS, type SujetPost } from "@/lib/server/ai/posts";
import { resolveTradeOrDefault } from "@/lib/trades";

/**
 * Le texte que le personnage prononce.
 *
 * CE N'EST PAS UN POST LU À VOIX HAUTE
 *
 * Une publication écrite se relit, se survole, supporte une énumération. Un
 * texte parlé n'a qu'une seule chance : celui qui écoute ne revient pas en
 * arrière. D'où des phrases courtes, aucune liste, aucun chiffre à retenir —
 * et une seule idée par vidéo.
 *
 * LA LONGUEUR EST UN COÛT, PAS UN CONFORT
 *
 * Fabric facture à la SECONDE de vidéo produite, et la durée est dictée par
 * l'audio, donc par le nombre de caractères. Un script deux fois plus long
 * coûte deux fois plus cher. La grille tarifaire — une vidéo à 2 CHF sur un
 * abonnement à 49 CHF — ne tient qu'à cette borne. Ce n'est donc pas une
 * consigne de style : c'est ce qui rend la fonction vendable.
 *
 * CE QUE CES VIDÉOS NE FONT PAS
 *
 * Elles n'améliorent pas le classement, pas plus que les posts texte : voir la
 * note en tête de ai/posts.ts. Elles occupent la fiche, et c'est un argument de
 * conversion. Le prompt ne cherche donc aucune « optimisation ».
 */

/**
 * Borne dure du script.
 *
 * 220 caractères ≈ 15 secondes de parole, soit 2,25 $ en 720p. C'est la valeur
 * sur laquelle repose la grille : 1 vidéo/mois en Basique, 2 en Essentiel,
 * 1/semaine en Professionnel. La déplacer, c'est refaire les calculs.
 */
export const LONGUEUR_MAX_SCRIPT = 220;

export interface ContexteScript {
  businessName: string;
  city: string;
  tradeType: string;
  sujet: SujetPost;
  /** Précisions de l'artisan, si le tableau de bord en a recueilli. */
  precisions?: string | null;
}

export interface ScriptGenerator {
  generate(ctx: ContexteScript): Promise<string>;
}

export function buildScriptPrompt(ctx: ContexteScript): { system: string; user: string } {
  const metier = resolveTradeOrDefault(ctx.tradeType);
  const sujet = SUJETS.find((s) => s.tag === ctx.sujet) ?? SUJETS[0];

  const system = [
    `Tu écris ce qu'une personne va DIRE face caméra pour la fiche Google d'un ${metier.label} à ${ctx.city}.`,
    "",
    "RÈGLES ABSOLUES",
    `- ${LONGUEUR_MAX_SCRIPT} caractères MAXIMUM. C'est une limite de coût, pas de style.`,
    "- Deux phrases, trois au plus. Courtes.",
    "- C'est parlé : aucune énumération, aucune parenthèse, aucun tiret.",
    "- Aucun chiffre à retenir, aucun prix, aucun délai, aucune promesse d'intervention.",
    "- Ne cite jamais un client, un nom, une adresse.",
    "- Pas de superlatif publicitaire (« le meilleur », « n° 1 », « imbattable »).",
    // Même raison que pour les posts : le bourrage de mots-clés est le réflexe
    // du modèle, il produit un texte que personne n'écoute.
    "- Le métier et la ville se disent une fois chacun, au plus.",
    "- Français de Suisse romande, vouvoiement, ton direct.",
    "- Pas d'émoji, pas de dièse, pas de didascalie entre crochets.",
    "",
    `Vocabulaire du métier : ${metier.lexique}.`,
    "",
    "Rends UNIQUEMENT les mots à prononcer. Rien d'autre.",
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
 * Nettoie ce que rend le modèle.
 *
 * Deux corrections, et chacune vient d'un travers observable :
 *
 *   - les guillemets englobants, que le modèle ajoute quand on lui demande une
 *     réplique ; prononcés, ils ne s'entendent pas, mais ils faussent le
 *     décompte de caractères sur lequel repose le coût ;
 *   - les didascalies entre crochets ou parenthèses (« [souriant] »), que la
 *     synthèse vocale lirait à voix haute.
 */
export function nettoyerScript(texte: string): string {
  return texte
    .trim()
    .replace(/^["«»']+|["«»']+$/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Coupe au dernier point avant la limite.
 *
 * Tronquer au caractère laisserait une phrase en suspens — audible, celle-là :
 * le personnage s'arrêterait au milieu d'un mot.
 */
export function tronquerScript(texte: string, max = LONGUEUR_MAX_SCRIPT): string {
  const propre = nettoyerScript(texte);
  if (propre.length <= max) return propre;
  const coupe = propre.slice(0, max);
  const fin = Math.max(coupe.lastIndexOf("."), coupe.lastIndexOf("!"), coupe.lastIndexOf("?"));
  // La moitié de la borne : en deçà, on préfère une phrase complète plus
  // courte à un texte amputé de sa moitié.
  //
  // `max - 1` dans la branche de repli, et non `max` : le point ajouté compte.
  // Couper à la borne PUIS ajouter un caractère la dépasse d'un — ce qui ne
  // serait qu'une inélégance si cette borne était stylistique, mais elle est
  // budgétaire. Trouvé par le test, pas en relisant.
  return fin > max * 0.5
    ? coupe.slice(0, fin + 1)
    : `${propre.slice(0, max - 1).trimEnd()}.`;
}

export const openAiScriptGenerator: ScriptGenerator = {
  async generate(ctx) {
    const cle = process.env.OPENAI_API_KEY;
    if (!cle) throw new Error("OPENAI_API_KEY absente.");
    const { system, user } = buildScriptPrompt(ctx);
    try {
      const client = new OpenAI({ apiKey: cle });
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // 220 caractères ≈ 80 tokens. La marge absorbe un dépassement sans
        // laisser le modèle écrire un paragraphe qu'on paierait à la seconde.
        max_tokens: 140,
        // Douze vidéos par an pour le même artisan ne doivent pas se répéter.
        temperature: 0.8,
      });
      const texte = completion.choices[0]?.message?.content?.trim();
      if (!texte) throw new Error("Réponse vide du modèle.");
      return tronquerScript(texte);
    } catch (err) {
      classifyOpenAiError(err);
    }
  },
};
