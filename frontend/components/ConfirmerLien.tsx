"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Bouton qui consomme le lien de connexion.
 *
 * Un seul geste demandé à l'artisan, et il remplace le mot de passe qu'on lui
 * a promis de ne pas lui faire retenir.
 */
export default function ConfirmerLien({ token }: { token: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function connecter() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await fetch("/api/auth/lien", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        setErreur(d.error ?? "La connexion a échoué. Demandez un nouveau lien.");
        setEnCours(false);
        return;
      }
      /*
       * `refresh()` avant `push()` : le cookie vient d'être posé, et sans lui
       * le cache de navigation servirait la version « non connectée » du
       * tableau de bord, qui redirige aussitôt vers la page de connexion.
       */
      router.refresh();
      router.push("/tableau-de-bord");
    } catch {
      setErreur("Connexion impossible. Vérifiez votre réseau et réessayez.");
      setEnCours(false);
    }
  }

  return (
    <main className="vide">
      <h1 className="vide-titre">Connexion à MapArtisans</h1>
      {erreur ? (
        <>
          <p className="vide-texte">{erreur}</p>
          <Link href="/connexion" className="lp-btn">
            Aller à la page de connexion
          </Link>
        </>
      ) : (
        <>
          <p className="vide-texte">
            Un dernier geste, et vous y êtes. Ce lien ne servira qu&apos;une fois.
          </p>
          <button className="lp-btn" onClick={connecter} disabled={enCours}>
            {enCours ? "Connexion…" : "Me connecter"}
          </button>
        </>
      )}
    </main>
  );
}
