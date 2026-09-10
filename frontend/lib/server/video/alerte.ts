// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { assertAffordable, resolveSmsSender, type SmsSender } from "@/lib/server/sms/twilio";

/**
 * Alerte de solde fal.ai.
 *
 * POURQUOI NOUS COMPTONS AU LIEU D'INTERROGER
 *
 * fal expose bien un point de facturation — /billing/user_details — mais il
 * exige une clé de portée ADMIN. Créer une telle clé pour lire un nombre, puis
 * la poser sur un serveur de production, serait un mauvais échange : elle peut
 * bien plus que générer des vidéos. Constaté, pas supposé : la clé de portée
 * API reçoit un 403 explicite sur ce point.
 *
 * Nous savons de toute façon compter nous-mêmes. Chaque ligne de `video_posts`
 * porte son `cost_usd` : la dépense du mois est une somme, pas une estimation.
 *
 * DEUX DÉCLENCHEURS, PARCE QU'ILS NE COUVRENT PAS LE MÊME OUBLI
 *
 * · PRÉVENTIF — la dépense du mois approche l'enveloppe déclarée. Il prévient
 *   AVANT la panne, ce qui laisse le temps de recharger.
 * · RÉACTIF — le solde est déjà vide, fal refuse. Il ne prévient plus, il
 *   constate ; mais il ne dépend d'aucun réglage et ne peut donc pas être
 *   oublié, lui.
 *
 * Le second existe parce que le premier suppose une enveloppe correctement
 * renseignée. Une alerte qui repose sur un réglage humain ne protège pas de
 * l'oubli humain.
 */

/** Part de l'enveloppe à partir de laquelle on prévient. */
export const SEUIL_ALERTE = 0.8;

/**
 * Une seule alerte par jour et par motif.
 *
 * Sans cela, un solde vide déclencherait un SMS par vidéo refusée — donc
 * plusieurs par heure, à cinq centimes pièce, précisément le jour où l'on ne
 * veut plus dépenser.
 */
export const FENETRE_ANTI_REPETITION_S = 86_400;

export type MotifAlerte = "seuil" | "epuise";

export interface ContexteAlerte {
  depenseUsd: number;
  enveloppeUsd: number;
}

/**
 * Le SMS, en un seul segment.
 *
 * `assertAffordable` refuse au-delà : un message à deux segments coûte le
 * double et signale surtout qu'on écrit trop pour une alerte qui doit se lire
 * d'un coup d'œil sur un chantier.
 */
export function composerAlerte(motif: MotifAlerte, ctx: ContexteAlerte): string {
  if (motif === "epuise") {
    return (
      "MapArtisans : credits fal.ai epuises. " +
      "Les posts video sont suspendus, aucune periode n'est perdue. " +
      "Rechargez sur fal.ai/dashboard/billing"
    );
  }
  const reste = Math.max(0, ctx.enveloppeUsd - ctx.depenseUsd);
  return (
    `MapArtisans : credits fal.ai bientot epuises. ` +
    `${ctx.depenseUsd.toFixed(2)} $ depenses ce mois sur ${ctx.enveloppeUsd.toFixed(0)} $, ` +
    `reste ${reste.toFixed(2)} $. Rechargez avant l'arret.`
  );
}

/** Faut-il prévenir, au vu de la dépense du mois ? */
export function seuilFranchi(ctx: ContexteAlerte): boolean {
  if (ctx.enveloppeUsd <= 0) return false;
  return ctx.depenseUsd >= ctx.enveloppeUsd * SEUIL_ALERTE;
}

export interface DependancesAlerte {
  sender?: SmsSender;
  destinataire?: string;
  /** Anti-répétition. Rend `true` si l'alerte a DÉJÀ été envoyée aujourd'hui. */
  dejaEnvoyee?: (motif: MotifAlerte) => Promise<boolean>;
  marquerEnvoyee?: (motif: MotifAlerte) => Promise<void>;
}

/**
 * Envoie l'alerte, une fois par jour au plus.
 *
 * Ne lève JAMAIS. Une alerte qui échoue ne doit pas faire échouer la
 * génération qui l'a déclenchée — ce serait transformer un avertissement en
 * panne. L'échec part au journal.
 */
export async function alerterSolde(
  motif: MotifAlerte,
  ctx: ContexteAlerte,
  deps: DependancesAlerte = {},
): Promise<boolean> {
  const destinataire = deps.destinataire ?? process.env.ADMIN_PHONE?.trim();
  if (!destinataire) return false;

  try {
    if (deps.dejaEnvoyee && (await deps.dejaEnvoyee(motif))) return false;

    const corps = composerAlerte(motif, ctx);
    assertAffordable(corps);
    await (deps.sender ?? resolveSmsSender()).send(destinataire, corps);
    await deps.marquerEnvoyee?.(motif);

    console.log(`[video] alerte « ${motif} » envoyée à l'exploitant`);
    return true;
  } catch (erreur) {
    console.error("[video] alerte de solde non envoyée :", erreur);
    return false;
  }
}
