import { HomeIcon, StarIcon, PostsIcon, ClientsIcon, AgendaIcon } from "./icons";
import type { ViewId } from "./types";

interface BottomNavProps {
  active: ViewId;
  onChange: (view: ViewId) => void;
  needsReviewCount: number;
  /** Rendez-vous à venir, affichés en pastille. */
  rdvCount?: number;
}

const ITEMS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: "home", label: "Accueil", icon: <HomeIcon /> },
  // Juste après l'accueil : c'est la question qu'un artisan se pose le plus
  // souvent en ouvrant l'application — « c'est quoi la suite ».
  { id: "agenda", label: "Agenda", icon: <AgendaIcon /> },
  { id: "reviews", label: "Avis", icon: <StarIcon /> },
  { id: "posts", label: "Posts", icon: <PostsIcon /> },
  { id: "clients", label: "Clients", icon: <ClientsIcon /> },
];

export default function BottomNav({ active, onChange, needsReviewCount, rdvCount = 0 }: BottomNavProps) {
  return (
    <nav className="bottomnav" aria-label="Navigation principale">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={`navitem${active === item.id ? " active" : ""}`}
          onClick={() => onChange(item.id)}
          aria-current={active === item.id ? "page" : undefined}
        >
          <span className="nav-ic">{item.icon}</span>
          {item.label}
          {item.id === "reviews" && needsReviewCount > 0 ? ` (${needsReviewCount})` : ""}
          {item.id === "agenda" && rdvCount > 0 ? ` (${rdvCount})` : ""}
        </button>
      ))}
    </nav>
  );
}
