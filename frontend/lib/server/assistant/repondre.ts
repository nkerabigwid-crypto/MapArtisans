// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import OpenAI from "openai";
import {
  OUTIL_RENDEZ_VOUS,
  buildSystemPrompt,
  encadrerMessageVisiteur,
  validerRendezVous,
  type ContexteAssistant,
  type RendezVousDetecte,
} from "./conversation";
import { classifyOpenAiError } from "@/lib/server/ai/openai";

/**
 * Un tour de conversation de l'assistant.
 *
 * CE MODULE MANQUAIT
 *
 * `buildSystemPrompt`, `OUTIL_RENDEZ_VOUS` et `validerRendezVous` étaient
 * écrits et testés, et importés par aucun code de production : l'assistant
 * n'était atteignable par personne.
 *
 * Le tour est SANS ÉTAT. L'historique arrive du client à chaque appel plutôt
 * que d'être conservé côté serveur : conserver des conversations de visiteurs
 * créerait une obligation de protection des données sans contrepartie, et
 * l'artisan n'a besoin que du rendez-vous, pas du bavardage qui y a mené.
 */

export interface TourAssistant {
  role: "user" | "assistant";
  content: string;
}

export interface ReponseAssistant {
  reponse: string;
  rendezVous: RendezVousDetecte | null;
}

export interface DepsAssistant {
  client?: OpenAI;
}

/**
 * Nombre de tours d'historique retenus.
 *
 * Huit couvrent largement une prise de rendez-vous. Au-delà, la dépense croît à
 * chaque message alors que le contexte utile, lui, ne bouge plus — et un
 * historique long est aussi le moyen le plus simple de noyer les consignes
 * système sous du texte choisi par le visiteur.
 */
export const TOURS_MAX = 8;

function clientOpenAi(deps: DepsAssistant): OpenAI {
  if (deps.client) return deps.client;
  const cle = process.env.OPENAI_API_KEY;
  if (!cle) throw new Error("OPENAI_API_KEY absente.");
  return new OpenAI({ apiKey: cle });
}

export async function repondreAuVisiteur(
  input: {
    contexte: ContexteAssistant;
    message: string;
    historique?: TourAssistant[];
  },
  deps: DepsAssistant = {},
): Promise<ReponseAssistant> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(input.contexte) },
    // L'historique est tronqué AVANT d'être envoyé, et chaque message du
    // visiteur reste encadré : un tour ancien reste du texte d'inconnu.
    ...(input.historique ?? []).slice(-TOURS_MAX).map((t) =>
      t.role === "user"
        ? { role: "user" as const, content: encadrerMessageVisiteur(t.content) }
        : { role: "assistant" as const, content: t.content },
    ),
    { role: "user", content: encadrerMessageVisiteur(input.message) },
  ];

  try {
    const client = clientOpenAi(deps);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: [OUTIL_RENDEZ_VOUS],
      // Le modèle décide d'appeler l'outil ; on ne le force pas. Forcer
      // produirait un rendez-vous inventé dès la première question générale.
      tool_choice: "auto",
      temperature: 0.4,
      max_tokens: 400,
    });

    const choix = completion.choices[0]?.message;
    const appels = choix?.tool_calls ?? [];

    let rendezVous: RendezVousDetecte | null = null;
    for (const appel of appels) {
      if (appel.type !== "function") continue;
      if (appel.function.name !== OUTIL_RENDEZ_VOUS.function.name) continue;
      let brut: unknown;
      try {
        brut = JSON.parse(appel.function.arguments);
      } catch {
        // Le modèle a produit un JSON invalide : on ignore l'appel plutôt que
        // d'échouer. Le visiteur reçoit une réponse, l'artisan pas de
        // rendez-vous fantôme.
        continue;
      }
      const verdict = validerRendezVous(brut as Partial<RendezVousDetecte>);
      if (verdict.ok) {
        rendezVous = verdict.valeur;
      } else {
        console.warn(`[assistant] rendez-vous rejeté : ${verdict.raison}`);
      }
    }

    const texte = choix?.content?.trim();
    return {
      // Un appel d'outil sans texte est fréquent : le modèle « répond » par
      // l'action. Le visiteur ne doit pas voir un message vide.
      reponse:
        texte ||
        (rendezVous
          ? "C'est noté, votre demande a bien été transmise. Vous serez rappelé rapidement."
          : "Je n'ai pas de réponse à cette question. Contactez directement l'entreprise."),
      rendezVous,
    };
  } catch (err) {
    classifyOpenAiError(err);
  }
}
