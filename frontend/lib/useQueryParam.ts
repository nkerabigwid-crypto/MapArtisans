"use client";

import { useSyncExternalStore } from "react";

// La page est prérendue en statique : lire window.location pendant le rendu
// provoquerait une divergence d'hydratation. useSyncExternalStore est l'API
// prévue pour ça — elle renvoie une valeur côté serveur et une autre côté
// client, sans effet ni setState.
const subscribe = () => () => {};
const serverSnapshot = () => "";
const clientSnapshot = () => window.location.search;

/**
 * Lit un paramètre d'URL. Sert uniquement à démontrer des états que le
 * prototype ne peut pas atteindre autrement (statut d'abonnement, échec réseau)
 * tant que le backend n'existe pas.
 */
export function useQueryParam(name: string): string | null {
  const search = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return new URLSearchParams(search).get(name);
}
