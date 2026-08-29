// Icônes de service — traits simples, cohérents avec l'identité du site vitrine.
// Pas de librairie externe : quatre composants inline suffisent pour ce gabarit.

const common = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function BoltIcon() {
  return (
    <svg {...common}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

export function DropIcon() {
  return (
    <svg {...common}>
      <path d="M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z" />
    </svg>
  );
}

export function FlameIcon() {
  return (
    <svg {...common}>
      <path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1 1 2 2.5 2 4.5A5.5 5.5 0 0 1 6.5 15C6.5 9 12 6 12 2z" />
    </svg>
  );
}

export function WrenchIcon() {
  return (
    <svg {...common}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2 2.5-2.5z" />
    </svg>
  );
}

export const SERVICE_ICONS = [BoltIcon, DropIcon, DropIcon, FlameIcon, WrenchIcon, WrenchIcon];
