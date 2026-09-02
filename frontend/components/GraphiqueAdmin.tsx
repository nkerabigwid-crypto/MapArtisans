import type { PointSerie } from "@/lib/server/repo";

/**
 * Histogramme d'une série temporelle.
 *
 * SVG écrit à la main, sans bibliothèque de graphiques.
 *
 * Une bibliothèque ferait entrer plusieurs centaines de kilo-octets dans le
 * paquet du navigateur pour deux barres empilées, et imposerait un composant
 * client là où cette page est rendue sur le serveur. Trente barres et un axe
 * se dessinent en quarante lignes.
 */

interface GraphiqueAdminProps {
  titre: string;
  points: PointSerie[];
  /** Ce qu'on trace : le nombre d'inscriptions ou le revenu. */
  mesure: "inscriptions" | "revenu";
}

function valeur(p: PointSerie, mesure: GraphiqueAdminProps["mesure"]): number {
  return mesure === "inscriptions" ? p.inscriptions : p.revenuCentimes;
}

function formater(v: number, mesure: GraphiqueAdminProps["mesure"]): string {
  return mesure === "inscriptions"
    ? String(v)
    : `${(v / 100).toLocaleString("fr-CH", { maximumFractionDigits: 0 })} CHF`;
}

export default function GraphiqueAdmin({ titre, points, mesure }: GraphiqueAdminProps) {
  const valeurs = points.map((p) => valeur(p, mesure));
  const max = Math.max(...valeurs, 1);
  const total = valeurs.reduce((n, v) => n + v, 0);

  const L = 100;
  const H = 32;
  const largeurBarre = points.length > 0 ? L / points.length : L;

  return (
    <section className="graph">
      <header className="graph-tete">
        <h3 className="graph-titre">{titre}</h3>
        <span className="graph-total">{formater(total, mesure)}</span>
      </header>

      {total === 0 ? (
        /*
         * Un graphique plat dit « rien ne s'est encore passé », ce qui est
         * l'information juste. Mais une phrase le dit mieux qu'une ligne de
         * barres à zéro qu'on prendrait pour une panne d'affichage.
         */
        <p className="graph-vide">Aucune donnée sur la période.</p>
      ) : (
        <svg
          className="graph-svg"
          viewBox={`0 0 ${L} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${titre} : ${formater(total, mesure)} au total`}
        >
          {points.map((p, i) => {
            const v = valeur(p, mesure);
            const h = (v / max) * (H - 2);
            return (
              <rect
                key={p.cle}
                x={i * largeurBarre + largeurBarre * 0.15}
                y={H - h}
                width={largeurBarre * 0.7}
                height={h}
                className="graph-barre"
              >
                <title>{`${p.cle} — ${formater(v, mesure)}`}</title>
              </rect>
            );
          })}
        </svg>
      )}

      <footer className="graph-pied">
        <span>{points[0]?.cle}</span>
        <span>{points[points.length - 1]?.cle}</span>
      </footer>
    </section>
  );
}
