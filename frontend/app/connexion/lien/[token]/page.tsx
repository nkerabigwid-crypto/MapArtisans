import type { Metadata } from "next";
import EntetePublic from "@/components/EntetePublic";
import ConfirmerLien from "@/components/ConfirmerLien";

/**
 * Page d'arrivée d'un lien de connexion.
 *
 * Elle ne consomme rien : elle propose un bouton. Voir la raison détaillée
 * dans app/api/auth/lien/route.ts — en deux mots, les filtres anti-hameçonnage
 * ouvrent les liens des messages avant leur destinataire, et une consommation
 * automatique brûlerait le jeton avant que l'artisan ne clique.
 */
export const metadata: Metadata = {
  title: "Connexion — MapArtisans",
  // Un lien de connexion n'a rien à faire dans un index.
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="lp">
      <EntetePublic masquerConnexion />
      <ConfirmerLien token={token} />
    </div>
  );
}
