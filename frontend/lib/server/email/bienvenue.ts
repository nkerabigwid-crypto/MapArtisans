// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { createMagicLink, magicLinkUrl } from "@/lib/server/magicLink";
import { composeWelcomeEmail } from "./welcome";
import { resolveEmailSender, type EmailSender } from "./sender";
import { SITE_URL } from "@/lib/site";
import type { Repo } from "@/lib/server/repo";

/**
 * Envoi de l'e-mail de bienvenue, avec lien magique.
 *
 * POURQUOI L'ÉCHEC NE FAIT PAS ÉCHOUER L'INSCRIPTION
 *
 * Le compte est déjà créé et la session ouverte quand cette fonction est
 * appelée. Si l'envoi échoue — fournisseur indisponible, domaine pas encore
 * vérifié — l'artisan est déjà connecté et peut travailler. Faire échouer
 * l'inscription entière pour un e-mail non parti serait absurde : on
 * perdrait le client pour un message dont il n'a pas besoin dans l'immédiat.
 *
 * L'erreur est en revanche journalisée sans être avalée : un envoi qui ne part
 * jamais doit se voir.
 */
export async function envoyerBienvenue(
  options: {
    userId: string;
    email: string;
    brandName?: string | null;
    /** Facture PDF, si elle a été produite. */
    facture?: { nom: string; contenu: Buffer } | null;
    /** Renseigné quand ce message suit un paiement, pour le confirmer. */
    abonnement?: { palier: string; montantCentimes: number } | null;
  },
  deps: { repo: Repo; sender?: EmailSender } = { repo: undefined as never },
): Promise<{ envoye: boolean; raison?: string }> {
  const sender = deps.sender ?? resolveEmailSender();

  try {
    const { token, record } = await createMagicLink(options.userId);
    await deps.repo.saveMagicLink(record);

    const message = composeWelcomeEmail({
      magicLink: magicLinkUrl(SITE_URL, token),
      brandName: options.brandName ?? null,
      abonnement: options.abonnement ?? null,
    });

    await sender.send({
      to: options.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: options.facture
        ? [
            {
              filename: options.facture.nom,
              content: options.facture.contenu,
              contentType: "application/pdf",
            },
          ]
        : undefined,
    });

    return { envoye: true };
  } catch (err) {
    const raison = err instanceof Error ? err.message : String(err);
    // Journalisé, pas relevé : voir l'en-tête. L'inscription doit aboutir.
    console.error(`[bienvenue] envoi vers ${options.email} échoué : ${raison}`);
    return { envoye: false, raison };
  }
}
