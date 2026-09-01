/**
 * Identité légale de l'éditeur, et faits vérifiables sur le traitement des
 * données. Source unique des pages légales.
 *
 * POURQUOI TOUT VIENT DE L'ENVIRONNEMENT
 *
 * Même raison que pour la facturation : la raison sociale, l'adresse et le
 * numéro IDE ne peuvent pas avoir de valeur par défaut. Une page légale qui
 * affiche une adresse inventée est pire que pas de page — elle identifie
 * faussement le fournisseur, ce que la loi demande précisément d'éviter.
 *
 * Ce fichier ne prétend PAS remplacer un juriste. Il rassemble ce qui est
 * vérifiable depuis le code : où tournent les serveurs, quels sous-traitants
 * reçoivent quoi, combien de temps les données sont conservées. Les clauses
 * contractuelles des CGV, elles, doivent être relues.
 */

export interface IdentiteEditeur {
  raisonSociale: string;
  adresse: string[];
  email: string;
  /**
   * Numéro IDE (CHE-xxx.xxx.xxx), si l'entreprise est inscrite au registre du
   * commerce. Distinct du numéro de TVA : toute entreprise inscrite au RC a un
   * IDE, seules les assujetties ont un numéro de TVA.
   */
  ide: string | null;
  /** Directeur de la publication. */
  responsable: string | null;
}

/** Ce qui manque encore pour que les pages légales soient valables. */
export function champsManquants(): string[] {
  const requis: [string, string][] = [
    ["FACTURATION_RAISON_SOCIALE", "raison sociale"],
    ["FACTURATION_ADRESSE", "adresse du siège"],
    ["FACTURATION_EMAIL", "adresse de contact"],
  ];
  return requis.filter(([cle]) => !process.env[cle]?.trim()).map(([, label]) => label);
}

export function identiteEditeur(): IdentiteEditeur | null {
  if (champsManquants().length > 0) return null;
  return {
    raisonSociale: process.env.FACTURATION_RAISON_SOCIALE!.trim(),
    adresse: process.env.FACTURATION_ADRESSE!.split("|").map((l) => l.trim()).filter(Boolean),
    email: process.env.FACTURATION_EMAIL!.trim(),
    ide: process.env.FACTURATION_IDE?.trim() || null,
    responsable: process.env.LEGAL_RESPONSABLE?.trim() || null,
  };
}

/**
 * Sous-traitants et destinations des données.
 *
 * Chaque ligne correspond à un service réellement appelé par le code — pas à
 * une liste type recopiée. Un sous-traitant omis d'une politique de
 * confidentialité est une omission ; un sous-traitant listé mais jamais
 * utilisé est une inexactitude. Les deux se corrigent en lisant le code.
 */
export interface SousTraitant {
  nom: string;
  role: string;
  donnees: string;
  pays: string;
}

export const SOUS_TRAITANTS: SousTraitant[] = [
  {
    nom: "Hostinger",
    role: "Hébergement des serveurs et de la base de données",
    donnees: "L'ensemble des données du service",
    pays: "France (Paris)",
  },
  {
    nom: "OpenAI",
    role: "Génération des réponses aux avis et de l'assistant",
    donnees: "Texte de l'avis, métier, ville, nom de l'entreprise",
    pays: "États-Unis",
  },
  {
    nom: "Twilio",
    role: "Envoi des SMS de rapport et d'alerte",
    donnees: "Numéro de mobile, contenu du message",
    pays: "États-Unis",
  },
  {
    nom: "Google (Business Profile)",
    role: "Lecture des avis et publication des réponses",
    donnees: "Identifiants de la fiche, avis, réponses publiées",
    pays: "États-Unis",
  },
  {
    nom: "Let's Encrypt",
    role: "Certificats de sécurité du site",
    donnees: "Nom de domaine uniquement",
    pays: "États-Unis",
  },
];

/**
 * Durées de conservation.
 *
 * Reprises de ce que fait réellement le code, pas d'un usage du secteur :
 * la rétention des sauvegardes vient de deploy/sauvegarde.sh, celle des
 * pièces comptables du Code des obligations.
 */
export const CONSERVATION = [
  { donnee: "Compte et fiche d'entreprise", duree: "Tant que l'abonnement est actif" },
  { donnee: "Avis et réponses publiées", duree: "Tant que l'abonnement est actif" },
  { donnee: "Liens de connexion", duree: "15 minutes, puis usage unique" },
  { donnee: "Sauvegardes de la base", duree: "30 jours glissants" },
  {
    donnee: "Factures et pièces comptables",
    duree: "10 ans (Code des obligations, art. 958f)",
  },
];

/** Date de dernière révision, affichée en bas des pages légales. */
export const DERNIERE_REVISION = "31 août 2026";
