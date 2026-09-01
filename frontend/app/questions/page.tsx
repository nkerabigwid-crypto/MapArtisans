import type { Metadata } from "next";
import Link from "next/link";
import PiedDePage from "@/components/PiedDePage";
import { FAQ_PUBLIQUE, toutesLesQuestions, texteBrut } from "@/lib/faqPublique";
import EntetePublic from "@/components/EntetePublic";

export const metadata: Metadata = {
  title: "Questions fréquentes sur Google Maps pour artisans — MapArtisans",
  description:
    "Pourquoi vous n'apparaissez pas dans les résultats locaux, combien d'entreprises Google affiche, ce qui est autorisé pour récolter des avis. Réponses vérifiées, sources officielles.",
  alternates: { canonical: "/questions" },
};

/**
 * Page publique de questions fréquentes.
 *
 * DESTINÉE AUX ARTISANS, PAS À LEURS CLIENTS
 *
 * Ce sont les recherches d'un plombier qui se demande pourquoi il n'apparaît
 * pas — donc de prospects. Chaque réponse est vérifiable, et plusieurs
 * contredisent ce que vend le secteur : le « Top 3 garanti », les avis triés,
 * les publications qui élargiraient le rayon.
 *
 * SUR LE BALISAGE FAQPage
 *
 * Il est présent parce que la page en est réellement une, et qu'il aide à la
 * compréhension du contenu. Mais il ne faut rien en attendre de spectaculaire :
 * depuis 2023, Google réserve l'affichage enrichi des FAQ à un petit nombre de
 * sites institutionnels. Le balisage reste correct et sans risque ; il ne
 * produira simplement pas d'accordéon dans les résultats.
 */
function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: toutesLesQuestions().map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: texteBrut(q.reponse) },
    })),
  };
}

export default function QuestionsPage() {
  return (
    <div className="lp">
      <script
        type="application/ld+json"
        // Le contenu est écrit par nous, pas saisi par un tiers ; l'échappement
        // de « < » protège malgré tout la fermeture de la balise.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd()).replace(/</g, "\\u003c"),
        }}
      />

      <EntetePublic />

      <section className="lp-section faq-tete">
        <h1 className="lp-h2">Vos questions sur Google Maps</h1>
        <p className="lp-lede">
          Ce que les artisans nous demandent le plus souvent. Les réponses sont vérifiables —
          y compris celles qui contredisent ce qu&apos;on vous a peut-être promis ailleurs.
        </p>
      </section>

      {FAQ_PUBLIQUE.map((section) => (
        <section key={section.titre} className="lp-section faq-bloc">
          <h2 className="faq-section-titre">{section.titre}</h2>
          <div className="faq-liste">
            {section.questions.map((q) => (
              // <details> plutôt qu'un accordéon en JavaScript : le contenu est
              // dans le HTML dès le premier octet, donc lisible par un robot et
              // par quelqu'un dont le réseau a lâché en cours de chargement.
              <details key={q.question} className="faq-item">
                <summary className="faq-q">{q.question}</summary>
                <div
                  className="faq-r"
                  dangerouslySetInnerHTML={{ __html: q.reponse }}
                />
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="lp-final">
        <h2 className="lp-final-h">Une question qui n&apos;est pas ici ?</h2>
        <p className="lp-final-p">
          Essayez quatorze jours, sans carte bancaire. Vous verrez votre position réelle avant de
          décider quoi que ce soit.
        </p>
        <Link href="/onboarding" className="lp-btn lp-nav-cta">
          Activer mon essai gratuit
        </Link>
      </section>

      <PiedDePage />
    </div>
  );
}
