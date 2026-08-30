// PAS de `import "server-only"` : importé par workers/, hors du bundler Next.
import { measureSms } from "./gsm7";

/**
 * SMS d'alerte à l'artisan lors d'une demande de rendez-vous.
 *
 * C'est le SEUL message de ce système qui justifie une alerte immédiate : une
 * demande sans réponse pendant deux jours est un client perdu. Le rapport
 * hebdomadaire, lui, peut attendre le vendredi.
 *
 * MÊMES CONTRAINTES DE COÛT QUE LE RAPPORT HEBDOMADAIRE
 *
 * Un seul segment, aucun caractère hors GSM-7. Le gabarit proposé au départ
 * commençait par « 🚨 » : un emoji fait basculer tout le message en UCS-2, où
 * la limite tombe à 70 caractères — l'alerte serait partie en trois segments,
 * à chaque rendez-vous.
 */

export interface RendezVousSms {
  clientName: string;
  clientPhone: string;
  /** Date souhaitée, déjà validée. */
  requestedAt: Date;
  details?: string;
  /** Marque affichée. `null` pour un client direct. */
  brandName?: string | null;
}

const MARQUE_MAX = 24;

/** Date compacte et sans ambiguïté : « 04.09 a 14h30 ». */
function quand(d: Date): string {
  const jj = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mn = String(d.getUTCMinutes()).padStart(2, "0");
  return `${jj}.${mm} a ${hh}h${mn}`;
}

export function composeRendezVousSms(data: RendezVousSms): string {
  const marque = data.brandName?.trim()
    ? data.brandName.trim().slice(0, MARQUE_MAX)
    : "MapArtisans";

  const parts = [
    `${marque} : nouveau RDV`,
    quand(data.requestedAt),
    // Le nom d'abord, le numéro ensuite : c'est le numéro que l'artisan
    // cherche des yeux pour rappeler, et il doit finir la ligne pour être
    // sélectionnable d'un appui long sur la plupart des téléphones.
    data.clientName.slice(0, 28),
  ];

  const base = parts.join(" - ");
  const avecTel = `${base} - ${data.clientPhone}`;

  // Le motif n'est ajouté que s'il tient : mieux vaut une alerte sans détail
  // qu'une alerte à deux segments. L'artisan rappelle de toute façon.
  if (data.details) {
    const candidat = `${avecTel} - ${data.details.slice(0, 40)}`;
    if (measureSms(candidat + ".").segments === 1) return candidat + ".";
  }
  return avecTel + ".";
}

/** Vérifie qu'une alerte tient en un segment GSM-7. */
export function rendezVousFitsOneSegment(body: string): boolean {
  const cout = measureSms(body);
  return cout.segments === 1 && cout.encoding === "GSM-7";
}
