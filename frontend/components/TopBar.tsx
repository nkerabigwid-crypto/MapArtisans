import Link from "next/link";
import { GearIcon } from "./icons";
import { LogoMark } from "./Logo";

interface TopBarProps {
  companyName: string;
  /**
   * Métier et ville, sous le nom. Vide tant qu'aucune fiche n'est rattachée.
   *
   * L'en-tête est le SEUL élément présent sur les cinq écrans : c'est donc lui
   * qui donne à l'ensemble un air habité. Un nom seul, surmontant une page
   * vide, ressemble à une application qui n'a pas fini de charger.
   */
  sousTitre?: string | null;
  subLabel: string;
  /** Couleur du badge — doit refléter le statut, pas être décorative. */
  subTone: "good" | "warn" | "bad";
  onOpenSettings: () => void;
}

export default function TopBar({
  companyName,
  sousTitre,
  subLabel,
  subTone,
  onOpenSettings,
}: TopBarProps) {
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
        {sousTitre ? <span className="brand-sous-titre">{sousTitre}</span> : null}
        <span className={`sub-badge ${subTone}`}>{subLabel}</span>
      </div>
      <button className="gear-btn" aria-label="Réglages" onClick={onOpenSettings}>
        <GearIcon />
      </button>
    </header>
  );
}
