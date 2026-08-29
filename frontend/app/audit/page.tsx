import type { Metadata } from "next";
import { geoGrid, getGridStatus, googleProfile, company, resolveCompetitorName } from "@/lib/data";

export const metadata: Metadata = {
  title: "Audit de visibilité — MapArtisans",
  robots: { index: false, follow: false },
};

/**
 * Audit de visibilité, imprimable en PDF.
 *
 * C'est la reprise du point fort de BrightLocal (rapports en marque blanche),
 * qui est ce qui justifie le plan Agence : un commercial arrive chez un
 * prospect avec sa carte de visibilité déjà imprimée.
 *
 * Choix technique : une page HTML avec une feuille de style `@media print`,
 * pas une génération PDF côté serveur. Deux raisons concrètes :
 *
 * · Aucune dépendance lourde (Puppeteer et consorts embarquent un Chromium
 *   entier — ~300 Mo, un cauchemar à déployer en serverless).
 * · Le commercial peut relire et ajuster à l'écran avant d'imprimer, ce qu'un
 *   PDF généré en aveugle ne permet pas.
 *
 * L'export se fait par Ctrl+P → « Enregistrer au format PDF », natif sur tous
 * les navigateurs et systèmes.
 */

const STATUS_TEXT: Record<string, string> = {
  top1: "1re position — captation maximale",
  top3: "Visible dans le top 3",
  warn: "Première page, mais hors du pack",
  bad: "Hors radar",
};

export default function AuditPage() {
  const points = geoGrid.points.map((p) => ({
    ...p,
    status: getGridStatus(p.position),
    rival: resolveCompetitorName(p.top_competitor_place_id),
  }));

  const visibles = points.filter((p) => p.status === "top1" || p.status === "top3").length;
  const masques = points.filter((p) => p.status === "warn").length;
  const absents = points.filter((p) => p.status === "bad").length;
  const trouves = points.filter((p) => p.position !== null);
  const meilleure = trouves.length ? Math.min(...trouves.map((p) => p.position as number)) : null;

  const aujourdhui = new Date().toLocaleDateString("fr-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="audit">
      <div className="audit-actions no-print">
        <p>
          Pour exporter en PDF : <b>Ctrl+P</b> (ou <b>⌘+P</b>), puis « Enregistrer au format
          PDF ».
        </p>
      </div>

      <header className="audit-head">
        <div>
          <div className="audit-eyebrow">Audit de visibilité Google Maps</div>
          <h1 className="audit-title">{googleProfile.business_name}</h1>
          <div className="audit-sub">
            <span className="audit-trade">{company.trade_type}</span> · {googleProfile.city} ·
            relevé du {aujourdhui}
          </div>
        </div>
        <div className="audit-brand">
          MapArtisan<span className="audit-brand-s">s</span>
        </div>
      </header>

      <section className="audit-verdict">
        <div className="audit-verdict-n">
          {visibles} / {points.length}
        </div>
        <div className="audit-verdict-t">
          points de votre zone où vous apparaissez dans le top 3
        </div>
        <p className="audit-verdict-d">
          Google n&apos;affiche que trois fiches avant qu&apos;un utilisateur doive appuyer sur
          « Plus de résultats ». Sur les {points.length} points relevés autour de votre adresse,
          vous y êtes {visibles} fois. Les {masques + absents} autres sont des recherches où un
          concurrent reçoit l&apos;appel à votre place.
        </p>
      </section>

      <section className="audit-block">
        <h2 className="audit-h2">Relevé point par point</h2>
        <p className="audit-lede">
          Mot-clé analysé : « {geoGrid.keyword} ». Chaque ligne correspond à une recherche
          effectuée depuis un endroit précis de votre zone d&apos;intervention.
        </p>
        <table className="audit-table">
          <thead>
            <tr>
              <th>Secteur</th>
              <th>Position</th>
              <th>Situation</th>
              <th>Qui est 1er</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <td>
                  <b>{p.area}</b>
                  <span className="audit-ref"> ({p.label})</span>
                </td>
                <td className={`audit-pos ${p.status}`}>
                  {/* « 1re », pas « 1e » : en français seul le premier rang prend
                      cette forme, les suivants restent en « e ». */}
                  {p.position === null
                    ? "introuvable"
                    : `${p.position}${p.position === 1 ? "re" : "e"}`}
                </td>
                <td>{STATUS_TEXT[p.status]}</td>
                <td>{p.status === "top1" ? "— vous" : (p.rival ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="audit-attrib">Données Google Maps</p>
      </section>

      <section className="audit-block">
        <h2 className="audit-h2">Ce que cela signifie</h2>
        <div className="audit-cards">
          <div className="audit-card good">
            <div className="audit-card-n">{visibles}</div>
            <div className="audit-card-t">secteurs où l&apos;on vous trouve</div>
            <p>Vous êtes dans le pack affiché par défaut. C&apos;est là que naissent les appels.</p>
          </div>
          <div className="audit-card warn">
            <div className="audit-card-n">{masques}</div>
            <div className="audit-card-t">secteurs où vous êtes 4e à 10e</div>
            <p>
              Vous existez, mais hors du pack. C&apos;est la zone où un gain de quelques places
              change tout — le travail y est le plus rentable.
            </p>
          </div>
          <div className="audit-card bad">
            <div className="audit-card-n">{absents}</div>
            <div className="audit-card-t">secteurs où vous êtes absent</div>
            <p>
              Au-delà de la 10e position, personne ne descend. Ces recherches sont perdues
              aujourd&apos;hui.
            </p>
          </div>
        </div>
        {meilleure !== null && (
          <p className="audit-note">
            Votre meilleure position relevée est la{" "}
            <b>
              {meilleure}
              {meilleure === 1 ? "re" : "e"}
            </b>
            . C&apos;est la preuve que
            votre fiche est capable de ressortir — le travail consiste à étendre cette
            performance aux secteurs où elle ne se produit pas encore.
          </p>
        )}
      </section>

      <section className="audit-block">
        <h2 className="audit-h2">Ce que MapArtisans fait ensuite</h2>
        <ol className="audit-steps">
          <li>
            <b>Réponses aux avis.</b> Chaque nouvel avis reçoit une réponse rédigée par l&apos;IA,
            ancrée dans votre métier et votre localité, publiée sur votre fiche.
          </li>
          <li>
            <b>Posts locaux.</b> Des publications régulières sur les secteurs où vous êtes
            faible, pour renforcer le signal de proximité.
          </li>
          <li>
            <b>Relevé hebdomadaire.</b> Cette carte est refaite chaque semaine. Vous recevez
            l&apos;évolution par SMS, sans avoir à consulter quoi que ce soit.
          </li>
        </ol>
        <p className="audit-legal">
          Aucun classement n&apos;est garanti : l&apos;algorithme de Google n&apos;est contrôlé
          par personne d&apos;autre que Google. MapArtisans s&apos;engage sur le travail effectué
          et sa mesure, pas sur un résultat de position.
        </p>
      </section>

      <footer className="audit-foot">
        <span>MapArtisans — Suisse</span>
        <span>Audit généré le {aujourdhui}</span>
      </footer>
    </div>
  );
}
