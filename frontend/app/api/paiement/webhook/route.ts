import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getRepo } from "@/lib/server/repo";
import { verifierSignature } from "@/lib/server/paiement/stripe";
import { envoyerBienvenue } from "@/lib/server/email/bienvenue";

export const runtime = "nodejs";
// Jamais mise en cache : chaque événement est unique et doit atteindre le code.
export const dynamic = "force-dynamic";

/**
 * Webhook Stripe.
 *
 * TROIS RÈGLES QUI GOUVERNENT CETTE ROUTE
 *
 * 1. **La signature d'abord, rien avant.** L'adresse est publique. Sans
 *    vérification, n'importe qui poste un faux `checkout.session.completed` et
 *    s'active un abonnement gratuit. La signature est la SEULE chose qui
 *    distingue Stripe d'un inconnu — elle est donc vérifiée avant même de
 *    regarder le type d'événement.
 *
 * 2. **Le corps brut, jamais reparsé.** `request.text()` et non `.json()` :
 *    la signature porte sur les octets exacts. Un `JSON.parse` suivi d'une
 *    re-sérialisation change les espaces et invalide la vérification.
 *
 * 3. **Répondre 200 vite, et une seule fois par événement.** Stripe abandonne
 *    après quelques secondes et rejoue pendant trois jours tant qu'il n'a pas
 *    de 200. Un traitement lent provoque donc des rejeux — d'où le verrou
 *    d'idempotence, posé avant tout travail.
 */
export async function POST(request: NextRequest) {
  const corpsBrut = await request.text();
  const signature = request.headers.get("stripe-signature");

  let evenement: Stripe.Event;
  try {
    evenement = verifierSignature(corpsBrut, signature);
  } catch (err) {
    const raison = err instanceof Error ? err.message : String(err);
    console.error(`[stripe] signature refusée : ${raison}`);
    // 400 et non 500 : ce n'est pas une panne de notre côté, c'est un appel
    // qui ne vient pas de Stripe. Stripe, lui, ne rejoue pas les 400.
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  const repo = getRepo();

  // Verrou d'idempotence AVANT tout travail. Si l'événement a déjà été traité,
  // on répond 200 sans rien refaire : c'est ce que Stripe attend, et cela
  // arrête les rejeux.
  const nouveau = await repo.marquerEvenementStripe(evenement.id, evenement.type);
  if (!nouveau) {
    return NextResponse.json({ recu: true, deja: true });
  }

  try {
    await traiter(evenement, repo);
  } catch (err) {
    const raison = err instanceof Error ? err.message : String(err);
    // Journalisé et renvoyé en 500 : Stripe rejouera. L'événement reste
    // marqué comme traité, ce qui est un compromis assumé — un rejeu ne
    // corrigerait pas une erreur de notre code, et provisionnerait deux fois
    // si l'échec était partiel. L'alerte dans les journaux est le bon endroit
    // pour intervenir à la main.
    console.error(`[stripe] ${evenement.type} (${evenement.id}) en échec : ${raison}`);
    return NextResponse.json({ error: "Traitement échoué." }, { status: 500 });
  }

  return NextResponse.json({ recu: true });
}

async function traiter(evenement: Stripe.Event, repo: ReturnType<typeof getRepo>) {
  switch (evenement.type) {
    case "checkout.session.completed": {
      const session = evenement.data.object as Stripe.Checkout.Session;
      // `client_reference_id` porte NOTRE identifiant utilisateur. L'e-mail ne
      // suffirait pas : le client peut en saisir un autre chez Stripe.
      const userId = session.client_reference_id;
      if (!userId) {
        throw new Error(`Session ${session.id} sans client_reference_id.`);
      }

      await repo.majAbonnement({
        userId,
        statut: "active",
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        planId: session.metadata?.planId ?? null,
      });

      const utilisateur = await repo.findUserById(userId);
      if (utilisateur) {
        // L'échec d'envoi ne relève pas : le paiement est encaissé et
        // l'abonnement actif. Faire échouer le webhook ferait rejouer le
        // paiement par Stripe pour un e-mail non parti.
        await envoyerBienvenue({ userId, email: utilisateur.email }, { repo });
      }
      break;
    }

    case "invoice.payment_failed": {
      const facture = evenement.data.object as Stripe.Invoice;
      const userId = retrouverUtilisateur(facture);
      if (userId) await repo.majAbonnement({ userId, statut: "past_due" });
      break;
    }

    case "customer.subscription.deleted": {
      // Absent de la spécification d'origine, et pourtant indispensable :
      // sans lui, un abonnement résilié chez Stripe resterait « actif » chez
      // nous, et le client continuerait d'être servi sans payer.
      const abonnement = evenement.data.object as Stripe.Subscription;
      const userId = abonnement.metadata?.userId ?? null;
      if (userId) await repo.majAbonnement({ userId, statut: "canceled" });
      break;
    }

    default:
      // Les autres événements sont acceptés sans traitement : Stripe en envoie
      // beaucoup, et répondre 200 évite des rejeux inutiles.
      break;
  }
}

/**
 * Retrouve l'utilisateur derrière une facture.
 *
 * Par les métadonnées de l'abonnement, posées à la création de la session.
 * L'e-mail de la facture ne conviendrait pas : le client peut en saisir un
 * autre chez Stripe, et on passerait un compte en impayé au mauvais nom.
 */
function retrouverUtilisateur(facture: Stripe.Invoice): string | null {
  const metadonnees = (
    facture as unknown as { subscription_details?: { metadata?: Record<string, string> } }
  ).subscription_details?.metadata;
  return metadonnees?.userId ?? null;
}
