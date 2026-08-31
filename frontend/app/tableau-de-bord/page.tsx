import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { chargerTableauDeBord } from "@/lib/server/tableauDeBord";
import TableauDeBord from "@/components/TableauDeBord";

/**
 * Rendu à CHAQUE requête, jamais figé.
 *
 * L'écran dépend de l'utilisateur connecté et de l'état de son abonnement.
 * Prérendu, il servirait à tous les artisans les données du premier — ce que
 * faisait déjà la version précédente, qui affichait une entreprise fictive.
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  const jar = await cookies();
  const session = await verifySession(jar.get(sessionCookie.name)?.value);
  if (!session) redirect("/connexion");

  const donnees = await chargerTableauDeBord(session.uid);
  // Un compte sans entreprise signale une donnée incohérente, pas un état
  // d'attente : l'inscription crée toujours les deux. On renvoie vers
  // l'accueil plutôt que d'afficher un écran à moitié construit.
  if (!donnees) redirect("/onboarding");

  return <TableauDeBord donnees={donnees} />;
}
