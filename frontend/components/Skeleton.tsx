/**
 * Squelettes de chargement.
 *
 * Chaque squelette reprend la forme de l'écran qu'il remplace (mêmes cartes,
 * mêmes hauteurs) : un bloc gris générique ferait sauter la mise en page au
 * moment où les données arrivent.
 */

function Bar({ w = "100%", h = 14 }: { w?: string; h?: number }) {
  return <span className="sk-bar" style={{ width: w, height: h }} aria-hidden="true" />;
}

/** Enveloppe commune : annonce le chargement aux lecteurs d'écran. */
function SkeletonShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="view" aria-busy="true" aria-label={label}>
      <p className="sr-only">Chargement en cours…</p>
      {children}
    </section>
  );
}

export function HomeSkeleton() {
  return (
    <SkeletonShell label="Accueil">
      <div className="section-label">Visibilité locale</div>
      <div className="card">
        <Bar w="45%" h={12} />
        <div className="geo-grid" style={{ marginTop: "0.6rem" }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="sk-dot" aria-hidden="true" />
          ))}
        </div>
      </div>
      <div className="card">
        <Bar w="70%" h={34} />
        <div style={{ marginTop: "0.5rem" }}>
          <Bar w="40%" h={11} />
        </div>
      </div>
      <div className="section-label">Cette semaine</div>
      <div className="stat-row">
        {[0, 1].map((i) => (
          <div key={i} className="stat-tile">
            <Bar w="35%" h={24} />
            <div style={{ marginTop: "0.35rem" }}>
              <Bar w="55%" h={10} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}

export function ListSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <SkeletonShell label={label}>
      <div className="card">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="sk-row">
            <Bar w="30%" h={12} />
            <div style={{ marginTop: "0.4rem" }}>
              <Bar w={`${85 - i * 7}%`} h={13} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}

export function ClientsSkeleton() {
  return (
    <SkeletonShell label="Avis clients">
      <div className="section-label">Votre QR code</div>
      <div className="card qr-card">
        <span className="sk-qr" aria-hidden="true" />
        <Bar w="40%" h={16} />
        <div style={{ marginTop: "0.4rem" }}>
          <Bar w="55%" h={10} />
        </div>
      </div>
      <div className="section-label">Réclamations privées</div>
      <div className="card">
        {[0, 1].map((i) => (
          <div key={i} className="sk-row">
            <Bar w={`${80 - i * 15}%`} h={13} />
            <div style={{ marginTop: "0.35rem" }}>
              <Bar w="22%" h={10} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}

export function SettingsSkeleton() {
  return (
    <SkeletonShell label="Réglages">
      {["Fiche Google", "Abonnement", "Avancé"].map((section) => (
        <div key={section}>
          <div className="section-label">{section}</div>
          <div className="card">
            <div className="sk-row">
              <Bar w="45%" h={15} />
              <div style={{ marginTop: "0.35rem" }}>
                <Bar w="60%" h={10} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </SkeletonShell>
  );
}
