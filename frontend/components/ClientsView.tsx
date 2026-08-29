import type { QrCode } from "@/lib/data";

interface ClientsViewProps {
  qrCode: QrCode;
}

/**
 * Espace QR code de l'artisan.
 *
 * LA SECTION « RÉCLAMATIONS PRIVÉES » A ÉTÉ RETIRÉE
 *
 * Elle affichait les messages d'un formulaire de plainte qui devait s'ouvrir à
 * la place du lien Google quand le client s'apprêtait à mettre moins de quatre
 * étoiles. Ce tri porte un nom — le review gating — et Google l'interdit :
 * « Discourage or prohibit negative reviews, or selectively solicit positive
 * reviews from customers ». La sanction frappe la fiche de l'artisan, pas
 * l'éditeur.
 *
 * Le QR code mène donc tous les clients, sans exception, au formulaire d'avis
 * Google. C'est aussi ce qui rend le dossier d'accès à l'API défendable.
 */
export default function ClientsView({ qrCode }: ClientsViewProps) {
  const pret = qrCode.place_id !== null;

  return (
    <section className="view" aria-label="Votre QR code">
      <div className="section-label">Votre QR code</div>
      <div className="card qr-card">
        {pret ? (
          <>
            {/* Servi par /api/qr : la génération est côté serveur, l'encodeur
                ne part donc pas dans le paquet du navigateur. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="qr-visual"
              src="/api/qr"
              alt="QR code menant au formulaire d'avis Google de votre établissement"
              width={200}
              height={200}
            />
            <div className="qr-label">{qrCode.label}</div>
            <div className="qr-scans">{qrCode.scans_count} scans ce mois-ci</div>
            <a className="btn" href="/api/qr?telecharger=1" download>
              Télécharger le QR code
            </a>
            <p className="qr-note">
              Format vectoriel : il s&apos;agrandit sans perte, de la facture à
              l&apos;autocollant de carrosserie.
            </p>
          </>
        ) : (
          <div className="empty-state">
            Connectez votre fiche Google pour obtenir votre QR code.
          </div>
        )}
      </div>

      <div className="card qr-conseil">
        <div className="qr-conseil-t">Comment l&apos;utiliser</div>
        <p>
          Présentez-le à <strong>tous</strong> vos clients, sans exception : sur la
          facture, le devis, la camionnette. Un avis obtenu en triant les clients
          selon leur satisfaction expose votre fiche à une suppression par Google.
        </p>
      </div>
    </section>
  );
}
