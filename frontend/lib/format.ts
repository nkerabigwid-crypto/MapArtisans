/**
 * Formatages partagés.
 *
 * Dans un fichier `.ts` sans JSX, volontairement : la suite de tests tourne
 * avec `node --experimental-strip-types`, qui ne sait pas charger de `.tsx`.
 * Une fonction de formatage enfermée dans un composant React devient
 * intestable — et c'est exactement ce qui avait laissé passer « 1e ».
 */

/**
 * Ordinal français.
 *
 * « 1re », pas « 1e » : le premier est le seul ordinal irrégulier du français,
 * et l'écrire « 1e » saute aux yeux d'un lecteur francophone. Le défaut avait
 * été corrigé dans le rapport SMS mais pas sur la page d'accueil, faute d'une
 * fonction commune.
 *
 * `null` donne un tiret, jamais « 0e » : une fiche introuvable n'a pas de
 * position, et « 0e » se lirait comme un rang.
 */
export function ordinalFr(position: number | null): string {
  if (position === null) return "—";
  return position === 1 ? "1re" : `${position}e`;
}
