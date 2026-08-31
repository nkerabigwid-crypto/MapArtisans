import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { autoriserDemande, messageDeRefus } from "@/lib/server/assistant/access";
import { repondreAuVisiteur, type TourAssistant } from "@/lib/server/assistant/repondre";
import { composeRendezVousSms, rendezVousFitsOneSegment } from "@/lib/server/sms/rendezVous";
import { resolveSmsSender } from "@/lib/server/sms/twilio";
import { autoriserEnvoi } from "@/lib/server/sms/quota";
import { resolveTradeOrDefault } from "@/lib/trades";

export const runtime = "nodejs";

/**
 * Assistant du site de l'artisan.
 *
 * ADRESSE PUBLIQUE, SANS AUTHENTIFICATION
 *
 * Le widget vit sur le site d'un artisan et appelle cette route depuis le
 * navigateur d'un inconnu. La clé de widget est donc publique par construction :
 * ce qui protège, c'est la liste d'origines autorisées, le plafond de longueur
 * et le quota quotidien — les trois barrières de `autoriserDemande`, évaluées
 * AVANT tout appel facturé à OpenAI.
 *
 * Aucun refus n'explique sa raison au visiteur : dire « origine refusée »
 * indiquerait qu'il suffit de falsifier l'en-tête, dire « quota atteint »
 * confirmerait qu'on a réussi à l'épuiser.
 */

/** CORS : le widget appelle depuis un autre domaine, la préflight est obligatoire. */
function entetesCors(origine: string | null) {
  return {
    // L'origine est renvoyée telle quelle UNIQUEMENT après validation par
    // `autoriserDemande` ; sur refus on ne renvoie rien d'exploitable.
    "Access-Control-Allow-Origin": origine ?? "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: entetesCors(request.headers.get("origin")),
  });
}

export async function POST(request: NextRequest) {
  const origine = request.headers.get("origin");

  let corps: { widgetKey?: unknown; message?: unknown; historique?: unknown };
  try {
    corps = (await request.json()) as typeof corps;
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const { widgetKey, message } = corps;
  if (typeof widgetKey !== "string" || typeof message !== "string") {
    return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
  }

  const repo = getRepo();
  const reglages = await repo.findAssistantSettings(widgetKey);

  const messagesAujourdhui = reglages
    ? await repo.compterMessagesAssistant(reglages.googleProfileId)
    : 0;

  const verdict = autoriserDemande(reglages, { message, origine, messagesAujourdhui });
  if (!verdict.ok) {
    /*
     * 200 et non 4xx : le widget affiche le message tel quel au visiteur. Un
     * code d'erreur ferait apparaître une panne dans sa console alors que la
     * décision est délibérée — et distinguerait les motifs de refus, ce que
     * `messageDeRefus` s'attache justement à ne pas faire.
     */
    return NextResponse.json(
      { reponse: messageDeRefus(verdict.raison) },
      { status: 200, headers: entetesCors(null) },
    );
  }

  const fiche = await repo.getProfileById(reglages!.googleProfileId);
  const entreprise = fiche ? await repo.getCompanyForProfile(fiche.id) : null;
  if (!fiche) {
    return NextResponse.json(
      { reponse: messageDeRefus("cle-inconnue") },
      { status: 200, headers: entetesCors(null) },
    );
  }

  // Le quota est consommé dès l'acceptation, avant l'appel à OpenAI : une
  // réponse qui échoue a quand même coûté. Compter après laisserait un client
  // en échec répété consommer sans limite.
  await repo.incrementerMessagesAssistant(fiche.id);

  const historique = Array.isArray(corps.historique)
    ? (corps.historique as TourAssistant[]).filter(
        (t) =>
          t &&
          (t.role === "user" || t.role === "assistant") &&
          typeof t.content === "string",
      )
    : [];

  try {
    const resultat = await repondreAuVisiteur({
      contexte: {
        businessName: fiche.businessName,
        city: fiche.city,
        tradeType: resolveTradeOrDefault(entreprise?.tradeType ?? "").value,
        faqContext: reglages!.faqContext,
      },
      message,
      historique,
    });

    if (resultat.rendezVous) {
      const rdv = resultat.rendezVous;
      await repo.creerRendezVous({
        profileId: fiche.id,
        clientName: rdv.clientName,
        clientPhone: rdv.clientPhone,
        clientEmail: rdv.clientEmail ?? null,
        requestedAt: new Date(rdv.requestedAt),
        details: rdv.details ?? null,
      });

      /*
       * Le rendez-vous est ENREGISTRÉ avant d'être notifié. Si le SMS échoue,
       * l'artisan le retrouve dans son tableau de bord ; l'inverse — notifier
       * sans enregistrer — perdrait la demande d'un client réel.
       */
      const proprietaire = entreprise
        ? await repo.findUserById(entreprise.userId)
        : null;
      if (proprietaire?.phoneNumber) {
        const sms = composeRendezVousSms({
          clientName: rdv.clientName,
          clientPhone: rdv.clientPhone,
          requestedAt: new Date(rdv.requestedAt),
          details: rdv.details,
        });
        /*
         * Le plafond s'applique aussi ici. Un visiteur malveillant qui
         * enchaînerait de fausses demandes de rendez-vous ferait sinon partir
         * autant de SMS aux frais de l'artisan.
         *
         * Le rendez-vous est déjà ENREGISTRÉ à ce stade : si le plafond bloque
         * la notification, l'artisan retrouve la demande dans son tableau de
         * bord. On ne perd jamais un client réel.
         */
        const envoyes = entreprise ? await repo.compterSmsDuMois(entreprise.id) : 0;
        const quota = entreprise
          ? autoriserEnvoi(entreprise.planId, envoyes, "rendez-vous")
          : { ok: false };

        if (!quota.ok) {
          console.warn("[assistant] plafond SMS atteint, notification non envoyée");
        } else if (rendezVousFitsOneSegment(sms)) {
          try {
            await resolveSmsSender().send(proprietaire.phoneNumber, sms);
            if (entreprise) await repo.incrementerSmsDuMois(entreprise.id);
          } catch (err) {
            console.error("[assistant] notification SMS échouée :", err);
          }
        } else {
          console.error("[assistant] SMS de rendez-vous à plus d'un segment");
        }
      }
    }

    return NextResponse.json(
      { reponse: resultat.reponse, rendezVous: Boolean(resultat.rendezVous) },
      { status: 200, headers: entetesCors(origine) },
    );
  } catch (err) {
    console.error("[assistant] réponse échouée :", err);
    return NextResponse.json(
      { reponse: "L'assistant est momentanément indisponible. Réessayez dans un instant." },
      { status: 200, headers: entetesCors(origine) },
    );
  }
}
