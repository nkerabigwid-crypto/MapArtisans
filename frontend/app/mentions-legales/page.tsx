import type { Metadata } from "next";
import PageLegale from "@/components/PageLegale";
import { identiteEditeur } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Mentions légales — MapArtisans",
  description: "Identité de l'éditeur, hébergement et contact.",
  // Une page légale n'a aucune raison d'être indexée : elle ne répond à
  // aucune recherche et dilue le référencement des pages qui, elles, vendent.
  robots: { index: false, follow: true },
};

export default function MentionsLegalesPage() {
  const e = identiteEditeur();

  return (
    <PageLegale
      titre="Mentions légales"
      enTete="Qui édite ce service, où il est hébergé, et comment nous joindre."
    >
      <h2 className="legal-h2">Éditeur</h2>
      {e ? (
        <address className="legal-adresse">
          <strong>{e.raisonSociale}</strong>
          <br />
          {e.adresse.map((l) => (
            <span key={l}>
              {l}
              <br />
            </span>
          ))}
          {e.ide && (
            <>
              IDE : {e.ide}
              <br />
            </>
          )}
          <a href={`mailto:${e.email}`}>{e.email}</a>
          {e.responsable && (
            <>
              <br />
              Responsable de la publication : {e.responsable}
            </>
          )}
        </address>
      ) : (
        <p>
          L&apos;identité de l&apos;éditeur n&apos;est pas encore renseignée. Voir
          l&apos;avertissement ci-dessus.
        </p>
      )}

      {!e?.ide && (
        <p>
          L&apos;éditeur n&apos;est pas assujetti à la TVA : son chiffre d&apos;affaires annuel
          est inférieur au seuil légal de 100 000 CHF. Aucune TVA ne figure donc sur les
          factures.
        </p>
      )}

      <h2 className="legal-h2">Hébergement</h2>
      <p>
        Les serveurs et la base de données sont hébergés par <strong>Hostinger</strong>, dans un
        centre de données situé à <strong>Paris, France</strong>. Les données ne quittent pas
        l&apos;Union européenne pour leur stockage principal.
      </p>

      <h2 className="legal-h2">Propriété intellectuelle</h2>
      <p>
        Le code, les textes et l&apos;identité visuelle de MapArtisans appartiennent à
        l&apos;éditeur. Les fiches Google Business Profile, les avis et les données qui y
        figurent restent la propriété de leurs titulaires respectifs — l&apos;artisan pour sa
        fiche, Google pour les données de sa plateforme.
      </p>

      <h2 className="legal-h2">Données Google</h2>
      <p>
        MapArtisans accède aux fiches Google Business Profile <strong>uniquement</strong> par
        l&apos;API officielle, après consentement explicite de l&apos;artisan, et dans le
        respect des conditions de la plateforme Google Maps. Aucune donnée n&apos;est obtenue
        par extraction automatisée.
      </p>
    </PageLegale>
  );
}
