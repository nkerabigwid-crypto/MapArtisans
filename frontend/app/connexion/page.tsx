"use client";

import { useState } from "react";
import { Field } from "@base-ui/react/field";
import Link from "next/link";
import { Form } from "@base-ui/react/form";
import Logo from "@/components/Logo";
import { useQueryParam } from "@/lib/useQueryParam";

export default function LoginPage() {
  const suite = useQueryParam("suite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    <div className="app ob-app">
      {/* Le logo est aussi le retour vers le site. Une page de connexion sans
          issue enferme celui qui s'y est trompé de porte. */}
      <header className="auth-tete">
        <Link href="/" aria-label="Retour à l'accueil MapArtisans">
          <Logo taille={1.15} />
        </Link>
      </header>
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
            <Field.Label className="field-label">Mot de passe</Field.Label>
            <Field.Control
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-control"
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

          {/* Sans cette ligne, un visiteur sans compte est dans une impasse —
              y compris celui que le middleware vient de rediriger ici. */}
          <p className="auth-bascule">
            Pas encore de compte ? <Link href="/onboarding">Créer mon compte gratuitement</Link>
          </p>
        </Form>
      </main>
    </div>
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
