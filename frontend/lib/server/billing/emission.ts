// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import { genererFacturePdf } from "./invoice";
import { emetteurCourant, regimeTvaCourant } from "./config";
import { resolveEmailSender, type EmailSender } from "@/lib/server/email/sender";
import { PLANS, type PlanId } from "@/lib/data";
import type { Repo } from "@/lib/server/repo";

/**
 * Émission d'une facture après encaissement.
 *
 * CE MODULE EXISTE PARCE QUE PERSONNE N'APPELAIT LE GÉNÉRATEUR
 *
 * `genererFacturePdf`, la numérotation et la configuration de l'émetteur
 * étaient écrites et testées, et n'étaient importées par aucun code de
 * production. Un client qui payait ne recevait donc aucune facture.
 *
 * En Suisse ce n'est pas une courtoisie : c'est la pièce comptable que le client
 * doit produire, et que le CO impose de conserver dix ans (art. 958f).
 */

export interface DepsEmission {
  sender?: EmailSender;
}

/** Ce qu'un artisan lit dans son relevé bancaire, donc ce qu'il doit relire ici. */
function designationPour(planId: PlanId): string {
  const plan = PLANS.find((p) => p.id === planId);
  return plan
    ? `Abonnement MapArtisans ${plan.name} — 1 mois`
    : "Abonnement MapArtisans — 1 mois";
}

function montantCentimesPour(planId: PlanId): number | null {
  const plan = PLANS.find((p) => p.id === planId);
  // Un plan inconnu ne doit pas produire une facture à 0 CHF : mieux vaut ne pas
  // émettre et le voir dans les journaux qu'envoyer un document faux, qu'on ne
  // peut plus retirer de la comptabilité du client.
  return plan ? plan.amount * 100 : null;
}

/**
 * Émet la facture d'un paiement, puis la transmet au client.
 *
 * NE LÈVE JAMAIS. Appelée depuis le webhook Stripe, où une exception ferait
 * rejouer le paiement pendant trois jours pour un e-mail non parti. Le paiement
 * est encaissé et l'abonnement actif : l'échec d'émission se rattrape, la
 * facture restant en base avec `envoyee_le` à NULL.
 */
export async function emettreFacture(
  input: {
    repo: Repo;
    userId: string;
    email: string;
    planId: PlanId | null;
    stripeSessionId: string | null;
  },
  deps: DepsEmission = {},
): Promise<string | null> {
  try {
    if (!input.planId) {
      console.error("[facture] paiement sans planId, aucune facture émise");
      return null;
    }
    const montantCentimes = montantCentimesPour(input.planId);
    if (montantCentimes === null) {
      console.error(`[facture] plan inconnu « ${input.planId} », aucune facture émise`);
      return null;
    }

    // Lève si l'identité légale n'est pas configurée — et c'est voulu : une
    // facture sans émetteur identifiable n'a aucune valeur, et le message
    // d'erreur nomme la variable manquante.
    const emetteur = emetteurCourant();
    const regime = regimeTvaCourant();

    const facture = await input.repo.creerFacture({
      userId: input.userId,
      clientNom: input.email,
      clientEmail: input.email,
      designation: designationPour(input.planId),
      montantCentimes,
      devise: "CHF",
      tvaIde: regime.assujetti ? regime.numeroIde : null,
      stripeSessionId: input.stripeSessionId,
    });

    const pdf = await genererFacturePdf({
      numero: facture.numero,
      emiseLe: facture.emiseLe,
      payeeLe: facture.payeeLe,
      emetteur,
      // Le client n'a pas encore d'adresse postale chez nous : l'e-mail
      // l'identifie sans ambiguïté, et une adresse inventée serait pire
      // qu'absente sur une pièce comptable.
      client: { raisonSociale: input.email, adresse: [], email: input.email },
      designation: facture.designation,
      montantCentimes: facture.montantCentimes,
      regime,
    });

    const sender = deps.sender ?? resolveEmailSender();
    await sender.send({
      to: input.email,
      subject: `Votre facture ${facture.numero}`,
      text:
        `Bonjour,\n\n` +
        `Votre facture ${facture.numero} est jointe à ce message.\n\n` +
        `Merci de votre confiance.\n${emetteur.raisonSociale}\n`,
      // Volontairement sobre : une facture se lit dans la pièce jointe, pas
      // dans un message mis en page. Un HTML chargé augmente surtout le risque
      // de finir en indésirables, là où ce courrier doit toujours arriver.
      html:
        `<p>Bonjour,</p>` +
        `<p>Votre facture <b>${facture.numero}</b> est jointe à ce message.</p>` +
        `<p>Merci de votre confiance.<br>${emetteur.raisonSociale}</p>`,
      attachments: [
        {
          filename: `${facture.numero}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    await input.repo.marquerFactureEnvoyee(facture.numero);
    console.log(`[facture] ${facture.numero} émise et transmise`);
    return facture.numero;
  } catch (erreur) {
    console.error("[facture] émission échouée :", erreur);
    return null;
  }
}
