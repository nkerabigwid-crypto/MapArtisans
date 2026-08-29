import Link from "next/link";
import type { Metadata } from "next";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BlurFade } from "@/components/ui/blur-fade";
import { DotPattern } from "@/components/ui/dot-pattern";
import { Marquee } from "@/components/ui/marquee";
import { PLANS, geoGrid, getGridStatus } from "@/lib/data";
import GainSimulator from "@/components/marketing/GainSimulator";

export const metadata: Metadata = {
  title: "MapArtisans — Votre visibilité Google Maps en pilote automatique",
  description:
    "Pour les artisans et professionnels du transport en Suisse romande. MapArtisans gère vos avis, publie vos posts et suit votre position sur Google Maps, sans que vous ayez à y penser.",
};

const TRADES = [
  "Plombier", "Électricien", "Chauffagiste", "Serrurier", "Taxi",
  "Menuisier", "Peintre", "Maçon", "Couvreur", "Vitrier",
];

const PAINS = [
  {
    t: "Pas le temps ?",
    d: "Vous êtes sur vos chantiers ou au volant toute la journée. Rédiger des posts et répondre aux avis passe après tout le reste — et souvent, ça ne passe jamais.",
  },
  {
    t: "Avis laissés sans réponse ?",
    d: "Un avis sans réponse, c'est un client qui hésite et un signal de moins pour Google. Répondre vite compte autant que bien répondre.",
  },
  {
    t: "Concurrents envahissants ?",
    d: "Des fiches en doublon et des noms bourrés de mots-clés encombrent Maps. MapArtisans les repère et vous aide à les signaler.",
  },
];

const FEATURES = [
  {
    n: "01",
    t: "Réponses aux avis par l'IA",
    d: "Un avis à 4 ou 5 étoiles reçoit sa réponse tout seul, ancrée dans votre métier et votre ville. En dessous, rien n'est publié : l'IA prépare un brouillon et vous laisse décider. On ne répond jamais à un client mécontent en votre nom sans votre accord.",
  },
  {
    n: "02",
    t: "La Geo-Grid, sans jargon",
    d: "Votre visibilité quartier par quartier, relevée chaque semaine. Un point vert, ambre ou rouge par zone : vous voyez d'un coup d'œil où l'on ne vous trouve pas.",
  },
  {
    n: "03",
    t: "Le rapport SMS hebdomadaire",
    d: "Pas de tableau de bord à consulter. Un SMS par semaine : votre position, les appels et les itinéraires générés depuis votre fiche.",
  },
  {
    n: "04",
    t: "Le QR code de collecte d'avis",
    d: "Sur votre camionnette, vos devis, vos factures. Le client scanne, il arrive sur votre formulaire d'avis Google. Présenté à tout le monde, sans tri : c'est la seule méthode que Google autorise, et celle qui ne met jamais votre fiche en danger.",
  },
];

const FAQ = [
  {
    q: "Est-ce conforme aux règles de Google ?",
    a: "Oui. Nous passons exclusivement par l'API officielle Google Business Profile, avec votre consentement explicite — aucune automatisation détournée, aucun accès obtenu autrement.",
  },
  {
    q: "Puis-je annuler à tout moment ?",
    a: "Oui, en un clic depuis vos réglages. Sans engagement, sans frais de sortie. L'abonnement reste actif jusqu'à la fin du mois déjà payé.",
  },
  {
    q: "Combien de temps avant de voir un résultat ?",
    a: "Personne ne peut vous garantir une date : l'algorithme de Google n'appartient qu'à Google. Ce sur quoi nous nous engageons, c'est le travail fait — vos avis traités, vos posts publiés, votre position mesurée chaque semaine.",
  },
  {
    q: "Je n'y connais rien en informatique.",
    a: "C'est prévu pour ça. Après la connexion initiale, tout passe par un SMS hebdomadaire. Si vous voulez regarder de plus près, l'application tient sur votre téléphone et se lit en trente secondes.",
  },
  {
    q: "Et si j'arrête ?",
    a: "Votre fiche Google reste la vôtre. MapArtisans cesse d'y publier, mais rien n'est supprimé : avis et posts déjà en ligne restent en place.",
  },
];

export default function LandingPage() {
  const visibles = geoGrid.points.filter((p) => {
    const s = getGridStatus(p.position);
    return s === "top1" || s === "top3";
  }).length;

  return (
    <div className="lp">
      {/* ---------------- 1. En-tête ---------------- */}
      <header className="lp-nav">
        <span className="lp-logo">
          MapArtisan<span className="lp-logo-s">s</span>
        </span>
        <nav className="lp-nav-links">
          <Link href="#fonctionnalites">Fonctionnalités</Link>
          <Link href="#tarifs">Tarifs</Link>
        </nav>
        <div className="lp-nav-actions">
          <Link href="/connexion" className="lp-nav-login">
            Connexion
          </Link>
          <Link href="/onboarding" className="lp-nav-cta">
            Essai gratuit
          </Link>
        </div>
      </header>

      {/* ---------------- 2. Zone héros ---------------- */}
      <section className="lp-hero">
        <DotPattern
          className="lp-dots [mask-image:radial-gradient(400px_circle_at_center,white,transparent)]"
          width={22}
          height={22}
          cr={1}
        />
        <BlurFade delay={0.05} inView>
          <p className="lp-eyebrow">Visibilité Google Maps · Suisse romande</p>
        </BlurFade>
        <BlurFade delay={0.12} inView>
          <h1 className="lp-h1">
            Vous êtes le meilleur sur le terrain.
            <br />
            Encore faut-il qu&apos;on vous <span className="lp-accent">trouve</span>.
          </h1>
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <p className="lp-sub">
            Le marketing ne devrait pas être un devoir du dimanche soir. Pendant que vous êtes
            en intervention, MapArtisans répond à vos avis et suit votre position sur la carte.
            Aucune configuration technique, aucune connaissance du référencement.
          </p>
        </BlurFade>
        <BlurFade delay={0.28} inView>
          <div className="lp-cta-row">
            <Link href="/onboarding">
              <ShimmerButton
                className="lp-shimmer"
                background="var(--accent)"
                shimmerColor="#ffffff"
                borderRadius="10px"
              >
                Activer mon essai gratuit de 7 jours
              </ShimmerButton>
            </Link>
            <Link href="#tarifs" className="lp-btn-ghost">
              Voir les tarifs
            </Link>
          </div>
          <p className="lp-reassure">
            Aucune carte bancaire requise · Résiliable en un clic
          </p>
        </BlurFade>
      </section>

      {/* ---------------- 3. Le problème ---------------- */}
      <section className="lp-section lp-proof">
        <BlurFade delay={0.05} inView>
          <p className="lp-label">Le problème</p>
          <h2 className="lp-h2">
            Vous êtes le meilleur sur le terrain.
            <br />
            Encore faut-il qu&apos;on vous trouve.
          </h2>
          <p className="lp-lede">
            Sortez votre téléphone, cherchez votre métier dans votre ville. Comptez combien
            d&apos;entreprises apparaissent avant de devoir appuyer sur « Plus de résultats ».
            Google n&apos;en montre que trois.
          </p>
        </BlurFade>

        <div className="lp-pains">
          {PAINS.map((p, i) => (
            <BlurFade key={p.t} delay={0.12 + i * 0.07} inView>
              <div className="lp-pain">
                <div className="lp-pain-t">{p.t}</div>
                <p className="lp-pain-d">{p.d}</p>
              </div>
            </BlurFade>
          ))}
        </div>

        <BlurFade delay={0.15} inView>
          <div className="lp-grid-demo">
            <div className="lp-grid-kw">« {geoGrid.keyword} »</div>
            <div className="lp-grid">
              {geoGrid.points.map((p) => (
                <div key={p.label} className={`lp-dot ${getGridStatus(p.position)}`}>
                  <span className="lp-dot-area">{p.area}</span>
                  <span className="lp-dot-rank">
                    {p.position === null ? "—" : p.position + "e"}
                  </span>
                </div>
              ))}
            </div>
            <div className="lp-grid-legend">
              <span><i style={{ background: "var(--rank-top1)" }} />Top 3 — on vous appelle</span>
              <span><i style={{ background: "var(--status-warn)" }} />4 à 10 — on ne vous voit pas</span>
              <span><i style={{ background: "var(--status-bad)" }} />Au-delà — vous n&apos;existez pas</span>
            </div>
            <p className="lp-grid-note">
              Exemple de relevé. {visibles} points sur {geoGrid.points.length} dans le top 3 — les
              autres sont autant d&apos;appels qui partent chez un concurrent.
            </p>
          </div>
        </BlurFade>

        <BlurFade delay={0.25} inView>
          <div className="lp-inline-cta">
            <div>
              <div className="lp-inline-t">Vous voulez voir votre propre carte ?</div>
              <div className="lp-inline-d">Le premier relevé est offert, sans carte bancaire.</div>
            </div>
            <Link href="/onboarding" className="lp-btn">
              Obtenir ma carte
            </Link>
          </div>
        </BlurFade>
      </section>

      {/* ---------------- Métiers ---------------- */}
      <section className="lp-marquee-wrap">
        <Marquee pauseOnHover className="[--duration:32s]">
          {TRADES.map((t) => (
            <span key={t} className="lp-trade">
              {t}
            </span>
          ))}
        </Marquee>
        <p className="lp-marquee-note">
          Pensé pour les métiers qu&apos;on cherche dans l&apos;urgence, depuis un téléphone.
        </p>
      </section>

      {/* ---------------- 4. Fonctionnalités ---------------- */}
      <section className="lp-section" id="fonctionnalites">
        <BlurFade delay={0.05} inView>
          <p className="lp-label">Ce que fait MapArtisans</p>
          <h2 className="lp-h2">Quatre choses, faites sans vous.</h2>
        </BlurFade>
        <div className="lp-features">
          {FEATURES.map((f, i) => (
            <BlurFade key={f.n} delay={0.1 + i * 0.07} inView>
              <div className="lp-feature">
                <span className="lp-feature-n">{f.n}</span>
                <div>
                  <div className="lp-feature-t">{f.t}</div>
                  <p className="lp-feature-d">{f.d}</p>
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
        <BlurFade delay={0.4} inView>
          <div className="lp-inline-cta">
            <div>
              <div className="lp-inline-t">Deux minutes suffisent pour commencer</div>
              <div className="lp-inline-d">Sept jours d&apos;essai, sans carte bancaire.</div>
            </div>
            <Link href="/onboarding" className="lp-btn">
              Connecter ma fiche
            </Link>
          </div>
        </BlurFade>
      </section>

      {/* ---------------- Simulateur ---------------- */}
      <section className="lp-section">
        <BlurFade delay={0.05} inView>
          <p className="lp-label">Est-ce rentable pour vous ?</p>
          <h2 className="lp-h2">Faites le calcul avec vos propres chiffres.</h2>
          <p className="lp-lede">
            Pas de moyenne inventée : indiquez ce que vous facturez réellement, on vous dit à
            partir de quand l&apos;abonnement est remboursé.
          </p>
        </BlurFade>
        <BlurFade delay={0.15} inView>
          <GainSimulator planAmount={PLANS[0].amount} />
        </BlurFade>
      </section>

      {/* ---------------- 6. Tarifs ---------------- */}
      <section className="lp-section" id="tarifs">
        <BlurFade delay={0.05} inView>
          <p className="lp-label">Tarifs</p>
          <h2 className="lp-h2">Sans engagement. Résiliable en un clic.</h2>
          <p className="lp-lede">
            Sept jours d&apos;essai gratuit, sans carte bancaire. Tarifs en francs suisses.
          </p>
        </BlurFade>

        <div className="lp-plans">
          {PLANS.map((plan, i) => (
            <BlurFade key={plan.id} delay={0.12 + i * 0.08} inView className="lp-plan-fade">
              <div className={`lp-plan${plan.recommended ? " featured" : ""}`}>
                {plan.recommended && <div className="lp-plan-flag">Le plus choisi</div>}
                <div className="lp-plan-name">{plan.name}</div>
                <div className="lp-plan-price">
                  {plan.amount} <span>CHF / mois</span>
                </div>
                <p className="lp-plan-aud">{plan.audience}</p>
                <ul className="lp-plan-list">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link
                  href="/onboarding"
                  className={`lp-btn lp-plan-cta${plan.recommended ? "" : " ghost"}`}
                >
                  Essayer 7 jours
                </Link>
              </div>
            </BlurFade>
          ))}
        </div>
      </section>

      {/* ---------------- 7. FAQ ---------------- */}
      <section className="lp-section">
        <BlurFade delay={0.05} inView>
          <p className="lp-label">Vous vous demandez</p>
          <h2 className="lp-h2">Les questions qu&apos;on nous pose</h2>
        </BlurFade>
        <div className="lp-faq">
          {FAQ.map((f, i) => (
            <BlurFade key={f.q} delay={0.1 + i * 0.05} inView>
              <div className="lp-faq-item">
                <div className="lp-faq-q">{f.q}</div>
                <p className="lp-faq-a">{f.a}</p>
              </div>
            </BlurFade>
          ))}
        </div>
      </section>

      {/* ---------------- CTA final ---------------- */}
      <section className="lp-final">
        <BlurFade delay={0.05} inView>
          <h2 className="lp-final-h">
            Pendant que vous lisez ceci,
            <br />
            quelqu&apos;un cherche votre métier près de chez vous.
          </h2>
          <p className="lp-final-p">
            La seule question, c&apos;est de savoir s&apos;il vous trouve.
          </p>
          <Link href="/onboarding">
            <ShimmerButton
              className="lp-shimmer"
              background="var(--accent)"
              shimmerColor="#ffffff"
              borderRadius="10px"
            >
              Activer mon essai gratuit de 7 jours
            </ShimmerButton>
          </Link>
          <p className="lp-reassure">Aucune carte bancaire requise</p>
        </BlurFade>
      </section>

      <footer className="lp-footer">
        <span>MapArtisans — Suisse</span>
        <nav>
          <Link href="/abonnement">Tarifs</Link>
          <Link href="/onboarding">Créer un compte</Link>
          <Link href="/connexion">Connexion</Link>
          <Link href="/tableau-de-bord">Tableau de bord</Link>
        </nav>
      </footer>
    </div>
  );
}
