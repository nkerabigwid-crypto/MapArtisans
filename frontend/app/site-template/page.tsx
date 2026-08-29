import type { Metadata } from "next";
import styles from "./page.module.css";
import { siteConfig, SCHEMA_TYPE, GBP_PRIMARY_CATEGORY } from "./site.config";
import { SERVICE_ICONS } from "./icons";

const primaryCategory = GBP_PRIMARY_CATEGORY[siteConfig.tradeType];
const title = `${primaryCategory} à ${siteConfig.city} — Dépannage & Urgences | ${siteConfig.businessName}`;
const description = `${siteConfig.businessName}, ${primaryCategory.toLowerCase()} à ${siteConfig.city} depuis ${siteConfig.yearsInBusiness} ans. Intervention rapide, devis clair. Note ${siteConfig.aggregateRating.value}/5 sur ${siteConfig.aggregateRating.count} avis. Appelez le ${siteConfig.phoneDisplay}.`;

// Cette page ne fait AUCUN appel réseau et ne charge AUCUN JS de framework
// interactif côté client — elle est entièrement rendue côté serveur et livrée
// comme du HTML statique, pour le temps de chargement le plus court possible
// sur un téléphone en 4G moyenne, ce qui compte directement pour le Local
// 3-Pack (Core Web Vitals fait partie des signaux de classement de Google).
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/site-template" },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "fr_FR",
  },
};

function stars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[siteConfig.tradeType],
    name: siteConfig.businessName,
    image: `https://example.com/${siteConfig.tradeType}-hero.jpg`,
    telephone: siteConfig.phoneDisplay,
    email: siteConfig.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.addressLine,
      addressLocality: siteConfig.city,
      postalCode: siteConfig.postalCode,
      addressCountry: "FR",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: siteConfig.latitude,
      longitude: siteConfig.longitude,
    },
    url: "https://example.com/site-template",
    hasMap: siteConfig.googlePlaceUrl,
    areaServed: siteConfig.neighborhoods.map((n) => ({ "@type": "City", name: n })),
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "07:30",
        closes: "19:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday"],
        opens: "08:00",
        closes: "12:00",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: siteConfig.aggregateRating.value,
      reviewCount: siteConfig.aggregateRating.count,
    },
    review: siteConfig.reviews.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.author },
      datePublished: r.date,
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
      reviewBody: r.text,
    })),
    makesOffer: siteConfig.services.map((s) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: s.name, description: s.description },
    })),
  };
}

export default function SiteTemplatePage() {
  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />

      <a href="#main" className={styles.skipLink}>
        Aller au contenu
      </a>

      <header className={styles.header}>
        <a href="#top" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            {siteConfig.businessName.charAt(0)}
          </span>
          {siteConfig.businessName}
        </a>
        <nav className={styles.headerNav} aria-label="Navigation principale">
          <a href="#services">Services</a>
          <a href="#avis">Avis</a>
          <a href="#zone">Zone d&apos;intervention</a>
          <a href="#contact">Contact</a>
        </nav>
        <a className={styles.callBtn} href={`tel:${siteConfig.phoneHref}`}>
          📞 {siteConfig.phoneDisplay}
        </a>
      </header>

      <main id="main">
        <section className={styles.hero} id="top">
          <span className={styles.eyebrow}>
            {primaryCategory} à {siteConfig.city}
          </span>
          <h1 className={styles.heroTitle}>
            Un {primaryCategory.toLowerCase()} <em>de confiance</em> à {siteConfig.city}, sept jours sur sept
          </h1>
          <p className={styles.heroSubtitle}>
            {siteConfig.businessName} intervient à {siteConfig.city} et dans les communes voisines
            depuis {siteConfig.yearsInBusiness} ans. Devis clair avant intervention, urgences prises en
            charge le jour même.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.btnPrimary} href={`tel:${siteConfig.phoneHref}`}>
              📞 Appeler maintenant
            </a>
            <a className={styles.btnSecondary} href="#contact">
              Demander un devis
            </a>
          </div>
          <div className={styles.heroMeta}>
            <span>
              <span className={styles.heroStars} aria-hidden="true">
                {stars(Math.round(siteConfig.aggregateRating.value))}
              </span>{" "}
              <strong>{siteConfig.aggregateRating.value}/5</strong> ({siteConfig.aggregateRating.count} avis
              Google)
            </span>
            <span>
              <strong>{siteConfig.yearsInBusiness} ans</strong> d&apos;expérience à {siteConfig.city}
            </span>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sunken}`} id="services">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHead}>
              <p className={styles.sectionEyebrow}>Nos services</p>
              <h2 className={styles.sectionTitle}>Ce qu&apos;on fait, écrit comme sur votre fiche Google</h2>
              <p className={styles.sectionLede}>
                Chaque service correspond à une catégorie Google Business Profile, pour que ce que vous
                lisez ici soit exactement ce que vos clients trouvent sur Maps.
              </p>
            </div>
            <div className={styles.serviceGrid}>
              {siteConfig.services.map((service, i) => {
                const Icon = SERVICE_ICONS[i % SERVICE_ICONS.length];
                return (
                  <article className={styles.serviceCard} key={service.name}>
                    <div className={styles.serviceIcon} aria-hidden="true">
                      <Icon />
                    </div>
                    <h3 className={styles.serviceName}>{service.name}</h3>
                    <p className={styles.serviceDesc}>{service.description}</p>
                    <p className={styles.serviceTag}>{service.gbpCategory}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className={styles.section} id="avis">
          <div className={styles.sectionHead}>
            <p className={styles.sectionEyebrow}>Avis clients</p>
            <h2 className={styles.sectionTitle}>
              {siteConfig.aggregateRating.value}/5 sur {siteConfig.aggregateRating.count} avis Google
            </h2>
            <p className={styles.sectionLede}>Les derniers retours de clients à {siteConfig.city}.</p>
          </div>
          <div className={styles.reviewGrid}>
            {siteConfig.reviews.map((review) => (
              <article className={styles.reviewCard} key={`${review.author}-${review.date}`}>
                <div className={styles.reviewStars} aria-label={`${review.rating} étoiles sur 5`}>
                  {stars(review.rating)}
                </div>
                <p className={styles.reviewText}>&laquo; {review.text} &raquo;</p>
                <div className={styles.reviewMeta}>
                  <span>{review.author}</span>
                  <span>{review.neighborhood ?? siteConfig.city}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.sunken}`} id="zone">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHead}>
              <p className={styles.sectionEyebrow}>Zone d&apos;intervention</p>
              <h2 className={styles.sectionTitle}>{siteConfig.city} et les communes voisines</h2>
            </div>
            <div className={styles.areaChips}>
              {siteConfig.neighborhoods.map((n) => (
                <span className={styles.areaChip} key={n}>
                  {n}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.ctaBand}>
          <h2>Une urgence plomberie à {siteConfig.city} ?</h2>
          <p>On décroche, on donne un créneau, on arrive.</p>
          <a className={styles.btnPrimary} href={`tel:${siteConfig.phoneHref}`}>
            📞 {siteConfig.phoneDisplay}
          </a>
        </section>
      </main>

      <footer className={styles.footer} id="contact">
        <div className={styles.footerGrid}>
          <div className={styles.footerNap}>
            <p className={styles.footerHeading}>Coordonnées</p>
            <p>
              <strong>{siteConfig.businessName}</strong>
            </p>
            <p>
              {siteConfig.addressLine}, {siteConfig.postalCode} {siteConfig.city}
            </p>
            <p>
              <a href={`tel:${siteConfig.phoneHref}`}>{siteConfig.phoneDisplay}</a>
            </p>
            <p>
              <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
            </p>
          </div>
          <div>
            <p className={styles.footerHeading}>Horaires</p>
            {siteConfig.openingHours.map((h) => (
              <div className={styles.hoursRow} key={h.day}>
                <span>{h.day}</span>
                <span>{h.hours}</span>
              </div>
            ))}
          </div>
          <div>
            <p className={styles.footerHeading}>Zone desservie</p>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.92rem" }}>
              {siteConfig.neighborhoods.join(" · ")}
            </p>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>
            © {new Date().getFullYear()} {siteConfig.businessName}
          </span>
          <span>Site propulsé par MapArtisans</span>
        </div>
      </footer>
    </div>
  );
}
