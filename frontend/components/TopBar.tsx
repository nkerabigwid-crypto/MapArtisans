import { GearIcon } from "./icons";

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
