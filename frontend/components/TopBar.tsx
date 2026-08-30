import Link from "next/link";
import { GearIcon } from "./icons";
import { LogoMark } from "./Logo";

interface TopBarProps {
  companyName: string;
  subLabel: string;
  /** Couleur du badge — doit refléter le statut, pas être décorative. */
  subTone: "good" | "warn" | "bad";
  onOpenSettings: () => void;
}

export default function TopBar({ companyName, subLabel, subTone, onOpenSettings }: TopBarProps) {
  return (
    <header className="topbar">
      {/* Le logo ramène au site. Sans lui, le tableau de bord n'avait aucune
          sortie : ni retour à l'accueil, ni accès aux tarifs ou à l'aide —
          l'artisan devait retaper l'adresse à la main. */}
      <Link href="/" className="topbar-accueil" aria-label="Retour à l'accueil MapArtisans">
        <LogoMark taille={1.35} />
      </Link>
      <div className="brand">
        <span className="company-name">{companyName}</span>
        <span className={`sub-badge ${subTone}`}>{subLabel}</span>
      </div>
      <button className="gear-btn" aria-label="Réglages" onClick={onOpenSettings}>
        <GearIcon />
      </button>
    </header>
  );
}
