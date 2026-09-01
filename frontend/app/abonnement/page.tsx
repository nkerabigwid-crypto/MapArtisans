import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { chargerTableauDeBord } from "@/lib/server/tableauDeBord";
import { stripeConfigure } from "@/lib/server/paiement/stripe";
import ChoixFormule from "@/components/ChoixFormule";

/**
 * Page d'abonnement.
 *
 * Composant SERVEUR, comme le tableau de bord : elle affichait auparavant
 * l'entreprise de démonstration, donc le palier d'un plombier fictif — et
 * marquait « Formule actuelle » sur une formule que le visiteur n'avait
 * jamais souscrite.
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  const jar = await cookies();
  const session = await verifySession(jar.get(sessionCookie.name)?.value);
  if (!session) redirect("/connexion?suite=%2Fabonnement");

  const donnees = await chargerTableauDeBord(session.uid);
  if (!donnees) redirect("/onboarding");

  return (
    <ChoixFormule
      planActuel={donnees.company.plan_id}
      statut={donnees.company.subscription_status}
      paiementOuvert={stripeConfigure()}
    />
  );
}
