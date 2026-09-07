"use client";

import { useState } from "react";
import { Field } from "@base-ui/react/field";
import Link from "next/link";
import { Form } from "@base-ui/react/form";
import { useQueryParam } from "@/lib/useQueryParam";
import ChampMotDePasse from "@/components/ChampMotDePasse";
import EntetePublic from "@/components/EntetePublic";

export default function LoginPage() {
  const suite = useQueryParam("suite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /*
   * Demande d'un lien de connexion.
   *
   * Volontairement sur la MEME page, sous le bouton, et non derrière un
   * « mot de passe oublié ? » : l'artisan à qui on a promis de ne rien
   * retenir ne se pense pas comme quelqu'un qui a oublié.
   */
  const [lienEnvoye, setLienEnvoye] = useState<string | null>(null);
  const [lienEnCours, setLienEnCours] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "La connexion a échoué.");
        setPending(false);
        return;
      }
      // Redirection dure plutôt que le routeur : elle force la revalidation de
      // la session côté serveur au lieu de servir une page mise en cache.
      window.location.assign(sanitizeNext(suite));
    } catch {
      setError("Le serveur est injoignable. Vérifiez votre connexion.");
      setPending(false);
    }
  }

  return (
    <>
      {/* L'en-tête est HORS de la colonne de 460 px : c'est une barre de site,
          elle traverse l'écran. Dedans, elle héritait de la largeur du
          formulaire et son contenu débordait. */}
      <EntetePublic masquerConnexion />
      <div className="app ob-app">
      <main className="ob-main">
        <Form className="ob-form" onSubmit={handleSubmit}>
          <h1 className="ob-title">Connexion</h1>
          <p className="ob-lede">Accédez au tableau de bord de votre fiche Google.</p>

          <Field.Root name="email" className="field">
            <Field.Label className="field-label">Adresse e-mail</Field.Label>
            <Field.Control
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field-control"
            />
          </Field.Root>

          <Field.Root name="password" className="field">
            <ChampMotDePasse
              label="Mot de passe"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </Field.Root>

          {error && (
            <div className="card error-state" role="alert" style={{ marginBottom: "1rem" }}>
              <p className="err-body" style={{ margin: 0 }}>
                {error}
              </p>
            </div>
          )}

          <button type="submit" className="btn ob-next" disabled={pending}>
            {pending ? "Connexion…" : "Se connecter"}
          </button>

          {/* Le lien de connexion, sans mot de passe — ce que la page d'accueil
              promet. L'adresse déjà saisie est réutilisée : redemander ce
              qu'on vient de taper est le meilleur moyen de faire abandonner. */}
          {lienEnvoye ? (
            <p className="auth-lien-envoye">{lienEnvoye}</p>
          ) : (
            <button
              type="button"
              className="auth-lien"
              disabled={lienEnCours || !email}
              onClick={async () => {
                setLienEnCours(true);
                setError(null);
                try {
                  const r = await fetch("/api/auth/lien/demander", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                  });
                  const d = (await r.json().catch(() => ({}))) as {
                    message?: string;
                    error?: string;
                  };
                  if (!r.ok) setError(d.error ?? "Envoi impossible. Réessayez.");
                  else setLienEnvoye(d.message ?? "Lien envoyé.");
                } catch {
                  setError("Envoi impossible. Vérifiez votre réseau.");
                } finally {
                  setLienEnCours(false);
                }
              }}
            >
              {lienEnCours
                ? "Envoi…"
                : "Recevoir un lien de connexion, sans mot de passe"}
            </button>
          )}

          {/* Sans cette ligne, un visiteur sans compte est dans une impasse —
              y compris celui que le middleware vient de rediriger ici. */}
          <p className="auth-bascule">
            Pas encore de compte ? <Link href="/onboarding">Créer mon compte gratuitement</Link>
          </p>
        </Form>
      </main>
    </div>
    </>
  );
}

/**
 * N'accepte qu'un chemin interne.
 *
 * Sans ce filtre, `?suite=https://site-malveillant.example` transforme la page
 * de connexion en tremplin de redirection : un lien d'apparence légitime, qui
 * dépose l'artisan ailleurs juste après qu'il a saisi son mot de passe.
 */
function sanitizeNext(value: string | null): string {
  if (!value) return "/tableau-de-bord";
  if (!value.startsWith("/") || value.startsWith("//")) return "/tableau-de-bord";
  return value;
}
