// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans queue/connection.ts.
import { getRedisConnection } from "@/lib/server/queue/connection";
import { resoudreEtablissement, type EtablissementResolu } from "./resoudre";
import { releverGrille } from "./releve";
import type { ScannedPoint } from "./geoGrid";

/**
 * Audit public : la vraie carte d'un artisan, sans qu'il soit client.
 *
 * CE QU'IL DÉBLOQUE
 *
 * Jusqu'ici le suivi de position exigeait le rattachement OAuth de la fiche,
 * donc l'API Business Profile, dont l'accès n'est pas accordé. Places API
 * suffit à trouver un établissement par son nom : un artisan peut donc voir
 * sa position AVANT d'être client, et sans que rien n'ait été autorisé par
 * Google.
 *
 * CE QUE ÇA COÛTE, ET POURQUOI IL Y A TROIS VERROUS
 *
 * La résolution est facturée par Google (elle demande la position ; le relevé
 * de grille, lui, tient dans le palier gratuit). Une page publique qui la
 * déclencherait à chaque chargement serait une facture ouverte : il suffit
 * d'un robot qui parcourt le site.
 *
 *   1. CACHE — un même établissement n'est résolu qu'une fois par jour. C'est
 *      le verrou principal : la position d'un artisan ne bouge pas d'heure en
 *      heure, et un audit rechargé trois fois ne doit pas être payé trois fois.
 *   2. QUOTA PAR VISITEUR — quelques audits par adresse et par jour. Il ne
 *      protège pas contre un attaquant distribué ; il protège contre le cas
 *      réel, qui est un robot ou un curieux qui recharge.
 *   3. PLAFOND CHEZ GOOGLE — hors du code, dans la console. C'est le seul qui
 *      tienne quoi qu'il arrive, et c'est pour cela qu'il ne doit pas être
 *      remis à plus tard.
 *
 * Redis plutôt qu'une mémoire de processus : le cache survit aux
 * redéploiements, qui sont précisément le moment où un compteur en mémoire
 * repart à zéro.
 */

/** Un audit reste valable une journée. Une position ne bouge pas plus vite. */
const DUREE_CACHE_S = 86_400;

/** Audits distincts autorisés par adresse et par jour. */
export const QUOTA_PAR_JOUR = 5;

export interface DemandeAudit {
  nom: string;
  ville: string;
  motCle?: string;
  pays?: string;
}

export interface ResultatAudit {
  etablissement: EtablissementResolu;
  motCle: string;
  points: ScannedPoint[];
  echecs: number;
  releveLe: string;
  /** Vrai si la réponse vient du cache — aucun appel facturé n'a eu lieu. */
  duCache: boolean;
}

export class QuotaAuditDepasse extends Error {
  constructor() {
    super(
      `Vous avez déjà demandé ${QUOTA_PAR_JOUR} audits aujourd'hui. ` +
        "Revenez demain, ou écrivez-nous pour une analyse complète.",
    );
    this.name = "QuotaAuditDepasse";
  }
}

function normaliser(valeur: string): string {
  return valeur.trim().toLowerCase().replace(/\s+/g, " ");
}

/** La clé de cache ignore la casse et les espaces superflus : « Dupont  SA »
 *  et « dupont sa » sont le même établissement, et doivent coûter une fois. */
export function cleCache(d: DemandeAudit, motCle: string): string {
  return `audit:${normaliser(d.nom)}|${normaliser(d.ville)}|${normaliser(motCle)}`;
}

/**
 * Mot-clé par défaut : le métier et la ville.
 *
 * C'est ce que tape un habitant — « plombier genève », pas le nom de
 * l'entreprise. Chercher le nom donnerait toujours la première place et un
 * audit sans intérêt.
 */
export function motCleParDefaut(d: DemandeAudit): string {
  return d.motCle?.trim() || `${d.nom.trim().split(/\s+/)[0]} ${d.ville.trim()}`;
}

export interface DependancesAudit {
  redis?: Pick<ReturnType<typeof getRedisConnection>, "get" | "set" | "incr" | "expire">;
  resoudre?: typeof resoudreEtablissement;
  relever?: typeof releverGrille;
}

export async function auditPublic(
  demande: DemandeAudit,
  empreinteVisiteur: string,
  deps: DependancesAudit = {},
): Promise<ResultatAudit> {
  const redis = deps.redis ?? getRedisConnection();
  const motCle = motCleParDefaut(demande);
  const cle = cleCache(demande, motCle);

  // 1. Le cache d'abord, et AVANT le quota : un rechargement de la même page
  //    ne doit consommer ni argent ni droit de tirage.
  const enCache = await redis.get(cle);
  if (enCache) {
    return { ...(JSON.parse(enCache) as ResultatAudit), duCache: true };
  }

  // 2. Le quota ensuite, puisqu'un vrai appel va suivre.
  const cleQuota = `audit:quota:${empreinteVisiteur}:${new Date().toISOString().slice(0, 10)}`;
  const utilises = await redis.incr(cleQuota);
  if (utilises === 1) await redis.expire(cleQuota, DUREE_CACHE_S);
  if (utilises > QUOTA_PAR_JOUR) throw new QuotaAuditDepasse();

  const etablissement = await (deps.resoudre ?? resoudreEtablissement)({
    nom: demande.nom,
    ville: demande.ville,
    pays: demande.pays,
  });

  const releve = await (deps.relever ?? releverGrille)(
    {
      placeId: etablissement.placeId,
      latitude: etablissement.latitude,
      longitude: etablissement.longitude,
      pays: demande.pays,
    },
    motCle,
  );

  const resultat: ResultatAudit = {
    etablissement,
    motCle,
    points: releve.points,
    echecs: releve.echecs,
    releveLe: new Date().toISOString(),
    duCache: false,
  };

  // `EX` et non une expiration posée après coup : une clé écrite sans TTL par
  // un processus qui meurt juste après resterait indéfiniment.
  await redis.set(cle, JSON.stringify(resultat), "EX", DUREE_CACHE_S);
  return resultat;
}
