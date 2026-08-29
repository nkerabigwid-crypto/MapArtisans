// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.

/**
 * Numérotation des factures.
 *
 * POURQUOI CE N'EST PAS UN SIMPLE COMPTEUR
 *
 * Une numérotation comptable doit être **unique, séquentielle et sans trou**.
 * Trois pièges, tous rencontrés en production ailleurs :
 *
 * 1. **La concurrence.** Deux paiements Stripe validés dans la même seconde,
 *    et un « SELECT max(numero) + 1 » attribue deux fois le même numéro. Deux
 *    factures identiquement numérotées, c'est une comptabilité à reprendre à la
 *    main. L'allocation doit être atomique — en SQL, une SEQUENCE ou un
 *    `UPDATE … RETURNING` sur une ligne de compteur, jamais un lire-puis-écrire.
 *
 * 2. **Les trous.** Réserver un numéro puis échouer à produire le PDF laisse
 *    un trou dans la série, que le fiduciaire devra justifier. Le numéro se
 *    prend donc APRÈS que le document est prêt, jamais avant.
 *
 * 3. **Le changement d'année.** La série repart à 1 le 1er janvier. Un compteur
 *    global produirait FA-2027-0148 comme première facture de l'année.
 */

export interface InvoiceCounter {
  /** Année de la série. */
  annee: number;
  /** Dernier numéro attribué pour cette année. */
  dernier: number;
}

/** Format : FA-2026-0001. Quatre chiffres, donc 9999 factures par an. */
export function formatInvoiceNumber(annee: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Séquence invalide : ${sequence}. La numérotation commence à 1.`);
  }
  if (sequence > 9999) {
    // Bruyant plutôt que silencieux : au-delà, le format doit être élargi, et
    // ce n'est pas une décision à prendre au moment d'émettre une facture.
    throw new Error(
      `Séquence ${sequence} au-delà du format à 4 chiffres. Élargir le format ` +
        "et vérifier avec le fiduciaire que la continuité reste démontrable.",
    );
  }
  return `FA-${annee}-${String(sequence).padStart(4, "0")}`;
}

/** Vérifie qu'un numéro est bien formé — sert au contrôle d'intégrité de la série. */
export function parseInvoiceNumber(numero: string): { annee: number; sequence: number } | null {
  const m = /^FA-(\d{4})-(\d{4})$/.exec(numero.trim());
  if (!m) return null;
  return { annee: Number(m[1]), sequence: Number(m[2]) };
}

/**
 * Calcule le prochain numéro à partir de l'état du compteur.
 *
 * Fonction pure, testable : l'atomicité est la responsabilité du dépôt, qui
 * doit appeler ceci à l'intérieur de la même transaction que l'écriture.
 */
export function prochainNumero(
  compteur: InvoiceCounter | null,
  maintenant: Date = new Date(),
): { numero: string; compteur: InvoiceCounter } {
  const annee = maintenant.getFullYear();
  // Un compteur d'une année révolue ne se poursuit pas : la série repart à 1.
  const sequence = compteur && compteur.annee === annee ? compteur.dernier + 1 : 1;
  return {
    numero: formatInvoiceNumber(annee, sequence),
    compteur: { annee, dernier: sequence },
  };
}

/**
 * Contrôle qu'une série est continue.
 *
 * À passer sur l'export comptable de fin d'année : c'est exactement ce qu'un
 * fiduciaire vérifie, et le découvrir soi-même vaut mieux que l'apprendre de lui.
 */
export function trouverTrous(numeros: string[]): string[] {
  const parAnnee = new Map<number, number[]>();
  for (const n of numeros) {
    const p = parseInvoiceNumber(n);
    if (!p) throw new Error(`Numéro de facture malformé dans la série : « ${n} »`);
    const liste = parAnnee.get(p.annee) ?? [];
    liste.push(p.sequence);
    parAnnee.set(p.annee, liste);
  }

  const manquants: string[] = [];
  for (const [annee, sequences] of parAnnee) {
    const vues = new Set(sequences);
    const max = Math.max(...sequences);
    for (let i = 1; i <= max; i++) {
      if (!vues.has(i)) manquants.push(formatInvoiceNumber(annee, i));
    }
  }
  return manquants;
}
