import type { Metadata } from "next";
import PageLegale from "@/components/PageLegale";
import { CONSERVATION, SOUS_TRAITANTS, identiteEditeur } from "@/lib/legal";

/**
 * Rendu à CHAQUE requête, jamais figé à la construction.
 *
 * Cette page lit l'identité de l'éditeur dans les variables d'environnement.
 * Elles sont fournies au conteneur à l'EXÉCUTION, pas au moment du `next build`
 * qui tourne dans l'image Docker : une page prérendue les verrait toutes vides
 * et afficherait « Page incomplète » quelle que soit la configuration du
 * serveur — ce qui est exactement ce qui s'est produit.
 *
 * Le coût est nul : une page légale est consultée quelques fois par mois.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Protection des données — MapArtisans",
  description: "Quelles données sont traitées, par qui, où, et pendant combien de temps.",
  robots: { index: false, follow: true },
};

/**
 * Politique de confidentialité.
 *
 * CE QUI DISTINGUE CETTE PAGE D'UN MODÈLE RECOPIÉ
 *
 * Chaque sous-traitant listé correspond à un service réellement appelé par le
 * code, et chaque durée de conservation à ce que fait réellement le système —
 * les 30 jours viennent de deploy/sauvegarde.sh, les 15 minutes de
 * magicLink.ts. Un modèle générique aurait été plus long et moins vrai.
 */
export default function ConfidentialitePage() {
  const e = identiteEditeur();

  return (
    <PageLegale
      titre="Protection des données"
      enTete="Quelles données nous traitons, qui y a accès, où elles se trouvent, et combien de temps nous les gardons."
    >
      <h2 className="legal-h2">Ce que nous traitons</h2>
      <p>
        <strong>Vos données d&apos;artisan</strong> : adresse e-mail, mot de passe (jamais
        stocké en clair — seule une empreinte l&apos;est), numéro de mobile si vous le
        renseignez, nom et métier de votre entreprise.
      </p>
      <p>
        <strong>Les données de votre fiche Google</strong> : avis reçus, réponses publiées,
        positions relevées. Elles proviennent de l&apos;API Google, avec votre consentement, et
        ne servent qu&apos;à votre propre tableau de bord.
      </p>
      <p>
        <strong>Les données de vos clients</strong>, si vous utilisez l&apos;assistant : nom,
        téléphone et motif d&apos;une demande de rendez-vous. Nous ne les utilisons pour rien
        d&apos;autre que vous les transmettre.
      </p>

      <h2 className="legal-h2">Ce que nous ne faisons pas</h2>
      <ul className="legal-liste">
        <li>Nous ne vendons ni ne louons aucune donnée.</li>
        <li>Nous n&apos;affichons aucune publicité et n&apos;utilisons aucun traceur publicitaire.</li>
        <li>
          Nous ne trions pas vos clients selon leur satisfaction et ne filtrons aucun avis —
          Google l&apos;interdit, et nous ne le proposons pas.
        </li>
        <li>
          Nous n&apos;utilisons pas vos données pour entraîner un modèle d&apos;intelligence
          artificielle.
        </li>
      </ul>

      <h2 className="legal-h2">Qui d&apos;autre y a accès</h2>
      <p>
        Nous faisons appel aux prestataires ci-dessous, et à aucun autre. Chacun ne reçoit que
        ce qui lui est strictement nécessaire.
      </p>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th>Prestataire</th>
              <th>Rôle</th>
              <th>Données transmises</th>
              <th>Pays</th>
            </tr>
          </thead>
          <tbody>
            {SOUS_TRAITANTS.map((s) => (
              <tr key={s.nom}>
                <td>{s.nom}</td>
                <td>{s.role}</td>
                <td>{s.donnees}</td>
                <td>{s.pays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Certains de ces prestataires sont établis aux États-Unis. Le stockage principal de vos
        données, lui, reste en France.
      </p>

      <h2 className="legal-h2">Combien de temps</h2>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th>Donnée</th>
              <th>Conservation</th>
            </tr>
          </thead>
          <tbody>
            {CONSERVATION.map((c) => (
              <tr key={c.donnee}>
                <td>{c.donnee}</td>
                <td>{c.duree}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="legal-h2">Vos droits</h2>
      <p>
        Vous pouvez demander l&apos;accès à vos données, leur rectification, leur suppression,
        ou une copie exploitable. Écrivez-nous
        {e ? (
          <>
            {" "}
            à <a href={`mailto:${e.email}`}>{e.email}</a>
          </>
        ) : (
          " à l'adresse indiquée dans les mentions légales"
        )}
        . Nous répondons sous trente jours.
      </p>
      <p>
        À la résiliation, votre compte et vos données sont supprimés. Les sauvegardes existantes
        disparaissent d&apos;elles-mêmes sous trente jours. Les factures sont conservées dix
        ans : la loi comptable l&apos;impose et nous ne pouvons pas y déroger.
      </p>
      <p>
        <strong>Votre fiche Google reste la vôtre.</strong> Nous cessons d&apos;y publier, mais
        rien n&apos;y est supprimé : les avis et réponses déjà en ligne restent en place.
      </p>

      <h2 className="legal-h2">Sécurité</h2>
      <p>
        Les mots de passe sont protégés par une fonction de dérivation lente. Les jetons
        d&apos;accès Google sont chiffrés en base. Les échanges passent exclusivement par HTTPS.
        La base de données n&apos;est joignable depuis aucun réseau public.
      </p>
    </PageLegale>
  );
}
