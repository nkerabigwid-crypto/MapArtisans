"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Faux appel réseau — barrière de chargement.
 *
 * Le backend n'existe pas encore (voir README, « Ce qui n'est PAS branché »),
 * mais les écrans doivent déjà savoir afficher l'attente et l'échec : sinon on
 * découvre ces états le jour où on branche l'API, c'est-à-dire trop tard.
 *
 * Ce hook ne porte volontairement PAS les données. Les vues lisent l'état vivant
 * de `page.tsx` (une réponse publiée doit rafraîchir la liste immédiatement) ;
 * s'il renvoyait un instantané figé au moment du fetch, cette mise à jour serait
 * perdue. Quand les vraies routes arriveront, c'est ici que le chargement des
 * données atterrira, et `status` / `retry` ne bougeront pas.
 *
 * Pour démontrer les états sans backend, deux paramètres d'URL :
 *   ?simulate=error    → tous les écrans échouent
 *   ?simulate=loading  → tous les écrans restent en chargement
 */

export type FetchStatus = "loading" | "error" | "ready";

function simulationMode(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("simulate");
}

export function useMockFetch(delayMs = 650) {
  const [status, setStatus] = useState<FetchStatus>("loading");
  // Incrémenté par retry() ; relance l'effet sans dupliquer sa logique.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const mode = simulationMode();
    if (mode === "loading") return; // reste en chargement, aucun timer

    let cancelled = false;

    const timer = setTimeout(() => {
      if (cancelled) return;
      setStatus(mode === "error" ? "error" : "ready");
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attempt, delayMs]);

  // Le retour à « loading » se fait ici plutôt que dans l'effet : l'état initial
  // est déjà « loading », donc seul le réessai a besoin de le réarmer.
  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  return { status, retry };
}
