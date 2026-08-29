"use client";

import { useMockFetch } from "@/lib/useMockFetch";
import ErrorState from "./ErrorState";

interface ViewGateProps {
  /** Squelette affiché pendant le chargement — doit épouser la forme de l'écran. */
  skeleton: React.ReactNode;
  /** Ce qui n'a pas pu être chargé, pour le message d'erreur : « vos avis ». */
  what: string;
  children: React.ReactNode;
}

/**
 * Interpose chargement et erreur devant un écran.
 *
 * Monté à l'ouverture de l'onglet — chaque écran charge donc au moment où on
 * l'ouvre, comme le ferait un vrai appel réseau, et non tous au démarrage.
 */
export default function ViewGate({ skeleton, what, children }: ViewGateProps) {
  const { status, retry } = useMockFetch();

  if (status === "loading") return <>{skeleton}</>;
  if (status === "error") return <ErrorState what={what} onRetry={retry} />;
  return <>{children}</>;
}
