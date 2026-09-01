import EntetePublic from "@/components/EntetePublic";
import PiedDePage from "@/components/PiedDePage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ne plus recevoir de SMS",
  description: "Retirez votre numéro des demandes d'avis envoyées par MapArtisans.",
  robots: { index: false, follow: false },
};

/**
 * Page de désabonnement, atteinte depuis le lien du SMS.
 *
 * Les SMS partent d'un expéditeur alphanumérique : le destinataire ne peut pas
 * répondre « STOP », son téléphone le lui dit explicitement. Cette page est
 * donc le SEUL moyen de refuser, et elle doit rester simple — un champ, un
 * bouton, aucun compte à créer.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const { ok, e } = await searchParams;

  return (
    <div className="lp">
      <EntetePublic />
      <main className="stop">
        <h1 className="stop-titre">Ne plus recevoir de SMS</h1>

        {ok ? (
          <div className="stop-ok" role="status">
            <p className="stop-ok-titre">C&apos;est enregistré.</p>
            <p className="stop-texte">
              Ce numéro ne recevra plus aucune demande d&apos;avis, d&apos;aucun
              artisan utilisant MapArtisans. Vous n&apos;avez rien d&apos;autre à
              faire.
            </p>
          </div>
        ) : (
          <>
            <p className="stop-texte">
              Indiquez le numéro qui a reçu le message. Il sera retiré
              immédiatement, et pour tous les artisans — pas seulement celui qui
              vous a écrit.
            </p>

            {e && (
              <div className="card error-state" role="alert">
                {e === "2"
                  ? "L'enregistrement a échoué. Réessayez dans un instant."
                  : "Ce numéro ne semble pas valide. Indiquez-le au format international, par exemple +41 79 123 45 67."}
              </div>
            )}

            <form className="stop-form" method="post" action="/api/stop">
              <label className="field-label" htmlFor="phone">
                Votre numéro de mobile
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                placeholder="+41 79 123 45 67"
                className="field-control"
              />
              <button type="submit" className="btn stop-cta">
                Me désabonner
              </button>
            </form>

            <p className="stop-note">
              Le désabonnement est définitif et vaut pour tous les artisans.
              Aucun compte n&apos;est créé, et nous ne conservons que votre
              numéro pour ne plus vous écrire.
            </p>
          </>
        )}
      </main>
      <PiedDePage />
    </div>
  );
}
