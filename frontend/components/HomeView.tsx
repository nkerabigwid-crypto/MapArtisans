import GeoGridCard from "./GeoGridCard";
import type { GeoGrid, WeekStats, GoogleProfile } from "@/lib/data";

interface HomeViewProps {
  geoGrid: GeoGrid;
  weekStats: WeekStats;
  googleProfile: GoogleProfile;
}

export default function HomeView({ geoGrid, weekStats, googleProfile }: HomeViewProps) {
  return (
    <section className="view" aria-label="Accueil">
      <div className="section-label">Visibilité locale</div>
      <GeoGridCard geoGrid={geoGrid} />

      {geoGrid.points.length > 0 && (
        <div className="card rank-hero">
          <div className="num">
            {googleProfile.best_rank}
            <sup style={{ fontSize: "0.55em" }}>e</sup> sur Google Maps
          </div>
          <div className="label">« {googleProfile.keyword} »</div>
        </div>
      )}

      <div className="section-label">Cette semaine</div>
      <div className="stat-row">
        <div className="stat-tile">
          <div className="num">{weekStats.calls_generated}</div>
          <div className="lbl">Appels</div>
        </div>
        <div className="stat-tile">
          <div className="num">{weekStats.directions_generated}</div>
          <div className="lbl">Itinéraires</div>
        </div>
      </div>
    </section>
  );
}
