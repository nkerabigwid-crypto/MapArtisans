// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SujetPost } from "@/lib/server/ai/posts";
import { coutVideoUsd, genererVideo, televerser, type Resolution } from "./fal";
import { choisirPersonnage, type Personnage } from "./personnages";
import { openAiScriptGenerator, type ScriptGenerator } from "./script";
import { coutVoixUsd, genererVoix } from "./voix";

/**
 * Chaîne complète d'un post vidéo : du contexte de l'artisan au MP4.
 *
 *     script (OpenAI)  ->  voix (OpenAI)  ->  téléversement  ->  vidéo (Fabric)
 *
 * CE MODULE NE PUBLIE RIEN
 *
 * Il produit une vidéo et s'arrête là. La publication sur la fiche Google
 * passera par l'API Business Profile, dont l'accès n'est pas encore accordé
 * pour ce projet — `Google My Business API` n'apparaît même pas dans la
 * bibliothèque Cloud tant que la demande n'a pas abouti.
 *
 * La séparation n'est pas un pis-aller : générer et publier sont deux
 * opérations aux échecs distincts. Une vidéo produite mais non publiée doit
 * pouvoir être republiée sans être repayée — donc sans être régénérée.
 *
 * L'IMAGE EST LUE SUR DISQUE, PAS APPELÉE PAR SON URL
 *
 * Les personnages vivent dans public/, donc servis par le site : en production
 * une URL suffirait. Mais fal.ai ne peut pas atteindre `localhost`, et une
 * chaîne qui ne fonctionne qu'en production est une chaîne qu'on ne teste
 * jamais. Le téléversement, lui, marche des deux côtés — et il est gratuit.
 */

export interface ContexteVideo {
  /** Identifiant du profil Google : c'est lui qui fixe le personnage. */
  profilId: string;
  businessName: string;
  city: string;
  tradeType: string;
  sujet: SujetPost;
  precisions?: string | null;
  /** Personnages déjà attribués aux autres artisans du même couple ville/métier. */
  personnagesPris?: readonly string[];
}

export interface PostVideo {
  personnage: Personnage;
  script: string;
  videoUrl: string;
  /** Coût estimé de CETTE vidéo. Journalisé : un coût qu'on n'affiche pas est
   *  un coût qu'on ne surveille pas. */
  coutUsd: number;
}

export interface DependancesVideo {
  scriptGenerator?: ScriptGenerator;
  resolution?: Resolution;
  /** Injectables pour les tests, qui ne doivent appeler ni OpenAI ni fal.ai. */
  voix?: (texte: string) => Promise<Buffer>;
  televerser?: (octets: Buffer, nom: string, type: string) => Promise<string>;
  video?: (imageUrl: string, audioUrl: string, resolution: Resolution) => Promise<string>;
  lireImage?: (personnage: Personnage) => Promise<Buffer>;
}

/** Environ 15 caractères par seconde de parole — calé sur la mesure réelle :
 *  137 caractères ont donné 8,4 secondes. */
const CARACTERES_PAR_SECONDE = 16;

async function lireImageParDefaut(personnage: Personnage): Promise<Buffer> {
  return readFile(join(process.cwd(), "public", "personnages", personnage));
}

export async function genererPostVideo(
  ctx: ContexteVideo,
  deps: DependancesVideo = {},
): Promise<PostVideo> {
  const resolution = deps.resolution ?? "720p";
  const personnage = choisirPersonnage(ctx.profilId, ctx.personnagesPris ?? []);

  const script = await (deps.scriptGenerator ?? openAiScriptGenerator).generate({
    businessName: ctx.businessName,
    city: ctx.city,
    tradeType: ctx.tradeType,
    sujet: ctx.sujet,
    precisions: ctx.precisions,
  });

  const mp3 = await (deps.voix ?? ((t: string) => genererVoix(t)))(script);

  const deposer = deps.televerser ?? televerser;
  const image = await (deps.lireImage ?? lireImageParDefaut)(personnage);
  const imageUrl = await deposer(image, personnage, "image/png");
  const audioUrl = await deposer(mp3, "voix.mp3", "audio/mpeg");

  const videoUrl = deps.video
    ? await deps.video(imageUrl, audioUrl, resolution)
    : await genererVideo({ imageUrl, audioUrl, resolution });

  // Estimation et non mesure : la durée réelle n'est connue qu'en inspectant le
  // MP4. L'écart observé reste sous la seconde, ce qui suffit à surveiller une
  // dérive de coût.
  const secondes = Math.max(5, script.length / CARACTERES_PAR_SECONDE);

  return {
    personnage,
    script,
    videoUrl,
    coutUsd: coutVideoUsd(secondes, resolution) + coutVoixUsd(script),
  };
}
