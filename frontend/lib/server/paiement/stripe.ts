// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import Stripe from "stripe";
import { PLANS, type PlanId } from "@/lib/data";

/**
 * Passerelle Stripe.
 *
 * TROIS DÉCISIONS QUI NE SONT PAS DANS LA SPÉCIFICATION D'ORIGINE
 *
 * 1. **Les prix viennent de PLANS, pas de Stripe.** Un identifiant de tarif
 *    créé dans le tableau de bord Stripe deviendrait une seconde source de
 *    vérité : le jour où l'un des deux change, la page de tarifs et le
 *    prélèvement divergent — et le client a raison contre nous.
 *
 * 2. **L'essai ne demande pas de carte.** La page d'accueil promet « aucune
 *    carte bancaire requise ». Stripe le permet, mais il faut le demander
 *    explicitement ; par défaut, Checkout exige un moyen de paiement.
 *
 * 3. **Le webhook est idempotent.** Stripe rejoue un événement jusqu'à trois
 *    jours s'il ne reçoit pas de 200 — un réseau qui tremble suffit. Traiter
 *    deux fois le même paiement provisionnerait deux fois.
 */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;
  const cle = process.env.STRIPE_SECRET_KEY?.trim();
  if (!cle) {
    throw new Error(
      "STRIPE_SECRET_KEY absente. Aucun repli n'est prévu : une passerelle de " +
        "paiement qui démarre sans clé accepterait des commandes qu'aucun " +
        "prélèvement ne suivrait.",
    );
  }
  if (!/^sk_(test|live)_/.test(cle)) {
    // Vérification volontaire : une clé au mauvais préfixe échoue ici, avec un
    // message clair, plutôt qu'au premier appel API avec une erreur obscure.
    throw new Error(
      `STRIPE_SECRET_KEY invalide : elle doit commencer par « sk_test_ » ou ` +
        `« sk_live_ », pas par « ${cle.slice(0, 3)} ». Une clé publiable ` +
        `(pk_) ou un identifiant d'un autre service ne fonctionnera pas.`,
    );
  }
  client = new Stripe(cle, { apiVersion: "2026-08-26.dahlia" });
  return client;
}

/** La clé configurée est-elle une clé de test ? Affiché pour éviter les surprises. */
export function estEnModeTest(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

export interface DemandeCheckout {
  planId: PlanId;
  userId: string;
  email: string;
  /** Identifiant client Stripe existant, s'il y en a un. */
  stripeCustomerId?: string | null;
  baseUrl: string;
}

/**
 * Crée une session Checkout.
 *
 * `client_reference_id` porte notre identifiant utilisateur : c'est lui que le
 * webhook retrouvera pour savoir QUI vient de payer. Sans lui, il faudrait
 * deviner à partir de l'e-mail, qui peut différer de celui du compte.
 */
export async function creerSessionCheckout(
  demande: DemandeCheckout,
): Promise<{ url: string; sessionId: string }> {
  const plan = PLANS.find((p) => p.id === demande.planId);
  if (!plan) throw new Error(`Formule inconnue : ${demande.planId}`);

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    // Notre identifiant, transporté jusqu'au webhook.
    client_reference_id: demande.userId,
    customer: demande.stripeCustomerId ?? undefined,
    customer_email: demande.stripeCustomerId ? undefined : demande.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "chf",
          // Centimes : Stripe ne travaille qu'en entiers, et un montant
          // flottant introduirait des écarts d'arrondi sur la facturation.
          unit_amount: plan.amount * 100,
          recurring: { interval: "month" },
          product_data: {
            name: `MapArtisans — ${plan.name}`,
            description: plan.audience,
          },
        },
      },
    ],
    subscription_data: {
      trial_period_days: 7,
      metadata: { planId: plan.id, userId: demande.userId },
    },
    // « Aucune carte bancaire requise » : la promesse de la page d'accueil.
    // Sans cette ligne, Checkout exige un moyen de paiement dès l'essai.
    payment_method_collection: "if_required",
    metadata: { planId: plan.id, userId: demande.userId },
    success_url: `${demande.baseUrl}/tableau-de-bord?abonnement=actif`,
    cancel_url: `${demande.baseUrl}/#tarifs`,
    locale: "fr",
  });

  if (!session.url) throw new Error("Stripe n'a pas renvoyé d'URL de paiement.");
  return { url: session.url, sessionId: session.id };
}

/**
 * Vérifie la signature d'un webhook.
 *
 * SANS CETTE VÉRIFICATION, LA ROUTE EST UNE PORTE OUVERTE
 *
 * L'adresse du webhook est publique. N'importe qui peut y poster un faux
 * `checkout.session.completed` et activer gratuitement un abonnement. La
 * signature est la SEULE chose qui distingue Stripe d'un inconnu.
 *
 * Le corps doit être le TEXTE BRUT reçu : `JSON.parse` puis re-sérialisation
 * change les espaces et invalide la signature.
 */
export function verifierSignature(corpsBrut: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET absente. Sans elle, la route accepterait n'importe " +
        "quel appel prétendant venir de Stripe.",
    );
  }
  if (!signature) throw new Error("Signature absente de la requête.");
  return getStripe().webhooks.constructEvent(corpsBrut, signature, secret);
}
