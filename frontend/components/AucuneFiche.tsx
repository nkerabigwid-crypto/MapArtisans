/**
 * Écran d'accueil d'un compte sans fiche Google rattachée.
 *
 * C'EST L'ÉTAT QUE VERRONT TOUS LES PREMIERS CLIENTS
 *
 * Tant que l'accès à l'API Google Business Profile n'est pas accordé, aucun
 * artisan ne peut rattacher sa fiche : pas d'avis, pas de position, pas de
 * publication. Cet écran n'est donc pas un cas limite — c'est le premier écran
 * du produit, et celui sur lequel se décide la confiance.
 *
 * Il dit ce qui manque, pourquoi, et ce qui se passe ensuite. Un tableau de
 * bord vide sans explication se lit comme une panne.
 */
export default function AucuneFiche({ companyName }: { companyName: string }) {
  return (
    <div className="vide">
      <h1 className="vide-titre">Bienvenue, {companyName}</h1>
      <p className="vide-texte">
        Il reste une étape : rattacher votre fiche Google. C&apos;est elle qui nous
        permet de lire vos avis, d&apos;y répondre en votre nom et de suivre votre
        position sur Maps.
      </p>

      <ol className="vide-liste">
        <li>Vous autorisez MapArtisans depuis votre compte Google.</li>
        <li>Vos avis remontent ici, avec une réponse prête à relire.</li>
        <li>Le premier relevé de position arrive sous 24 heures.</li>
      </ol>

      <a className="vide-cta" href="/api/auth/google">
        Connecter ma fiche Google
      </a>

      <p className="vide-note">
        Vous gardez le contrôle : l&apos;autorisation se retire à tout moment depuis
        votre compte Google, et rien n&apos;est publié sans votre accord.
      </p>
    </div>
  );
}
