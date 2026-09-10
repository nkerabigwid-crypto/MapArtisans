import Logo from "@/components/Logo";

/**
 * Le formulaire d'entrée de l'audit public.
 *
 * POURQUOI UN FORMULAIRE HTML NU, SANS JAVASCRIPT
 *
 * Un `method="get"` recharge la page avec les paramètres dans l'URL. Cela
 * donne gratuitement ce qu'un formulaire piloté par JavaScript devrait
 * reconstruire : une adresse partageable, un retour arrière qui fonctionne,
 * une impression fidèle, et un audit qu'un commercial peut envoyer par message
 * à son prospect.
 *
 * C'est aussi ce qui permet à la page de rester un composant serveur, donc de
 * faire le relevé sans exposer la moindre clé.
 *
 * CE QU'IL N'Y A PAS, ET C'EST VOLONTAIRE
 *
 * Aucune adresse e-mail demandée. Réclamer un contact avant de montrer le
 * résultat transformerait l'audit en appât, et l'artisan qui repart sans
 * réponse garderait le souvenir d'une page qui lui a pris quelque chose. On
 * montre d'abord.
 */
export default function FormulaireAudit({
  nom = "",
  ville = "",
  erreur,
}: {
  nom?: string;
  ville?: string;
  erreur?: string;
}) {
  return (
    <div className="audit">
      <header className="audit-head">
        <div>
          <div className="audit-eyebrow">Audit de visibilité Google Maps</div>
          <h1 className="audit-title">Où vous trouve-t-on, quartier par quartier ?</h1>
          <div className="audit-sub">
            Entrez le nom de votre entreprise. Le relevé est fait en direct sur Google.
          </div>
        </div>
        <Logo taille={1.6} />
      </header>

      {erreur ? (
        <p className="legal-alerte" role="alert">
          {erreur}
        </p>
      ) : null}

      <form method="get" className="audit-form">
        <div className="audit-form-ligne">
          <label htmlFor="nom">Nom de votre entreprise</label>
          <input
            id="nom"
            name="nom"
            required
            defaultValue={nom}
            placeholder="SOS Home Sàrl"
            autoComplete="organization"
          />
        </div>

        <div className="audit-form-ligne">
          <label htmlFor="ville">Ville</label>
          <input
            id="ville"
            name="ville"
            required
            defaultValue={ville}
            placeholder="Genève"
            autoComplete="address-level2"
          />
        </div>

        <div className="audit-form-ligne">
          <label htmlFor="motcle">
            Ce que tapent vos clients <span className="audit-ref">(facultatif)</span>
          </label>
          <input id="motcle" name="motcle" placeholder="plombier genève" />
          {/* Le mot-clé importe plus que le nom : personne ne cherche une
              entreprise par sa raison sociale, on cherche un métier près de
              chez soi. Laissé vide, il est déduit du métier et de la ville. */}
        </div>

        <button type="submit" className="lp-btn">
          Voir ma position
        </button>
      </form>

      <p className="audit-legal">
        Aucun classement n&apos;est garanti : l&apos;algorithme de Google n&apos;est contrôlé
        par personne d&apos;autre que Google. Ce relevé mesure votre position à un instant
        donné, il ne la promet pas.
      </p>
    </div>
  );
}
