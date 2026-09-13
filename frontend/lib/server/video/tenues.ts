// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import { TRADES } from "@/lib/trades";

/**
 * Signe de métier par tenue, pour la génération des personnages vidéo.
 *
 * SOURCE SÉPARÉE DE lib/trades.ts, MAIS VÉRIFIÉE CONTRE ELLE
 *
 * `lib/trades.ts` existe précisément parce que la liste des métiers a vécu à
 * deux endroits et a divergé (voir sa note d'en-tête). Ce fichier introduit
 * une TROISIÈME liste — les tenues — avec le même risque. `verifierCompletude`
 * ci-dessous, appelée par un test, échoue si un métier de TRADES n'a pas de
 * tenue ici : la divergence casse le build plutôt que de se découvrir en
 * production sur un personnage sans habit.
 *
 * DISCRÉTION VOLONTAIRE
 *
 * Chaque tenue place son signe de métier au torse, à la ceinture ou en poche
 * — jamais un objet tenu devant le visage. Fabric anime la bouche et les
 * yeux ; un accessoire dans le cadre du visage dégraderait l'animation, pas
 * seulement l'esthétique.
 */
export const TENUE_PAR_METIER: Record<string, string> = {
  plombier: "wearing a plumber's work polo shirt, a pipe wrench visible on the tool belt at the waist",
  electricien: "wearing an electrician's hi-vis work vest, a voltage tester pen visible in the chest pocket",
  chauffagiste: "wearing a heating technician's work overalls with a company patch on the chest",
  serrurier: "wearing a locksmith's work vest, a small bunch of keys clipped to the belt",
  menuisier: "wearing a carpenter's canvas work apron over a shirt, a carpentry pencil tucked behind the ear",
  peintre: "wearing a painter's white work coverall with light paint smudges, a paint roller handle visible at the waist",
  macon: "wearing a mason's sturdy work vest over a shirt, a trowel visible on the tool belt",
  couvreur: "wearing a roofer's work vest with a safety harness strap visible on the shoulder",
  vitrier: "wearing a glazier's work apron, a suction-cup glass handle clipped at the waist",
  carreleur: "wearing a tiler's work apron over knee-pad trousers, a notched trowel visible at the waist",
  taxi: "wearing a smart-casual driver's polo shirt, a car key visible in one hand at waist height",
  vtc: "wearing a smart black polo shirt with a small lapel pin, a car key visible in one hand at waist height",
  transfert_aeroport: "wearing a smart black polo shirt, holding a small handwritten name sign at waist height",
  garage: "wearing a mechanic's work coverall with a company patch, hands lightly grease-marked",
  carrosserie: "wearing a bodywork technician's work coverall, a sanding block visible in one hand at waist height",
  depannage_auto: "wearing a hi-vis roadside-assistance work vest over a shirt",
  coiffeur: "wearing a stylish black hairdresser's apron over a fitted shirt, salon scissors visible in the front pocket",
  barbier: "wearing a barber's waxed apron over a shirt, a comb visible in the chest pocket",
  institut_beaute: "wearing a soft white spa tunic, a calm and welcoming posture",
  autre: "wearing a simple crew-neck sweater",
};

/**
 * Six personnes distinctes par tenue — âge, genre, coiffure. Sans cette
 * variation, les six visages d'un même métier ne se différencient que par le
 * hasard du modèle, ce que le personnage-témoin d'hier a montré insuffisant :
 * six têtes générées séparément avec le même prompt s'étaient déjà toutes
 * ressemblées côté âge et carrure.
 */
export const VARIANTES_PERSONNE: readonly string[] = [
  "a man in his early 30s, short dark hair",
  "a woman in her mid 40s, shoulder-length brown hair",
  "a man in his late 50s, greying hair",
  "a woman in her early 30s, curly hair",
  "a man in his 40s, short beard",
  "a woman in her 50s, short grey hair",
];

/** Lève si un métier de TRADES n'a pas de tenue — voir la note en tête de fichier. */
export function verifierCompletude(): void {
  const manquants = TRADES.map((t) => t.value).filter((v) => !(v in TENUE_PAR_METIER));
  if (manquants.length > 0) {
    throw new Error(`Tenue manquante pour : ${manquants.join(", ")}`);
  }
}
