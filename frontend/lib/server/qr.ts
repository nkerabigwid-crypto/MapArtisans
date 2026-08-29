// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import QRCode from "qrcode";

/**
 * QR code de collecte d'avis.
 *
 * L'artisan le colle sur sa camionnette, ses factures, la vitre de son taxi.
 * Le client scanne, arrive sur le formulaire d'avis Google, écrit ce qu'il veut.
 *
 * IL POINTE DIRECTEMENT VERS GOOGLE, SANS PAGE INTERMÉDIAIRE
 *
 * Une page intercalaire qui demanderait d'abord une note, puis n'enverrait vers
 * Google que les clients contents en redirigeant les autres vers un formulaire
 * privé, porte un nom : le review gating. Google l'interdit explicitement dans
 * ses règles de contenu — « Discourage or prohibit negative reviews, or
 * selectively solicit positive reviews from customers ».
 *
 * La sanction ne tombe pas sur nous, elle tombe sur la fiche de l'artisan :
 * avis supprimés, fiche pénalisée, voire suspendue. C'est exactement ce qu'il
 * nous paie pour éviter. Ce module ne construit donc aucune redirection
 * conditionnelle, et il ne faut pas en ajouter.
 *
 * Ce qui reste parfaitement autorisé, et que ce QR code fait : demander un avis
 * à TOUS les clients, sans trier et sans contrepartie.
 */

/**
 * Formulaire d'avis Google pour une fiche donnée.
 *
 * ATTENTION AU BON IDENTIFIANT : c'est le `place_id` (Places API), PAS le
 * `google_location_id` de l'API Business Profile. Ce sont deux identifiants
 * distincts pour le même établissement, et intervertir les deux produit un lien
 * qui ne mène nulle part — le QR code serait imprimé sur des centaines de
 * camionnettes avant que quiconque s'en aperçoive.
 */
export function reviewUrl(placeId: string): string {
  const id = placeId.trim();
  if (!id) throw new Error("place_id manquant : impossible de construire le lien d'avis.");
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}`;
}

/** Luminance relative, formule WCAG. */
function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

/** Rapport de contraste entre deux couleurs `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Contraste minimal entre les modules et le fond.
 *
 * Un lecteur de QR code binarise l'image avant de la décoder : sous un certain
 * écart, il ne distingue plus les modules du fond et le code devient illisible
 * — d'autant plus vite qu'il est imprimé, sali, ou scanné de nuit sur une
 * camionnette. 7:1 laisse de la marge par rapport aux conditions de laboratoire.
 *
 * C'est le garde-fou qui compte le jour où une couleur personnalisée arrive :
 * un bleu clair ou un jaune de marque produirait des milliers d'autocollants
 * inutilisables, et personne ne le verrait avant l'impression.
 */
const CONTRASTE_MIN = 7;

export interface QrOptions {
  /** Couleur des modules, `#rrggbb`. Défaut : bleu MapArtisans. */
  dark?: string;
  /** Couleur de fond, `#rrggbb`. Défaut : blanc. */
  light?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Produit le QR code au format SVG.
 *
 * SVG et non PNG : l'usage principal est l'impression — facture, autocollant de
 * carrosserie, adhésif de vitre. Un vectoriel s'agrandit sans perte, là où un
 * PNG de 500 px se pixellise dès le format A5.
 *
 * RIEN N'EST STOCKÉ EN BASE. Le QR code est une fonction pure de son URL :
 * le regénérer coûte moins d'une milliseconde, tandis que le conserver en
 * `TEXT`/`BLOB` alourdit chaque ligne de plusieurs kilo-octets et crée une
 * copie qui se désynchronise le jour où l'URL change.
 */
export async function generateReviewQr(placeId: string, options: QrOptions = {}): Promise<string> {
  const dark = options.dark ?? "#123f6d";
  const light = options.light ?? "#ffffff";

  for (const [nom, valeur] of [["dark", dark], ["light", light]] as const) {
    if (!HEX.test(valeur)) {
      throw new Error(`Couleur ${nom} invalide : « ${valeur} ». Format attendu #rrggbb.`);
    }
  }

  const contraste = contrastRatio(dark, light);
  if (contraste < CONTRASTE_MIN) {
    throw new Error(
      `Contraste insuffisant (${contraste.toFixed(1)}:1, minimum ${CONTRASTE_MIN}:1) entre ` +
        `${dark} et ${light}. Le QR code serait illisible une fois imprimé.`,
    );
  }

  return QRCode.toString(reviewUrl(placeId), {
    type: "svg",
    // Niveau Q : 25 % du code reste décodable même abîmé. Sur une carrosserie
    // exposée à la route, au sel et aux lavages, le niveau M par défaut ne
    // suffit pas — et un autocollant ne se corrige pas à distance.
    errorCorrectionLevel: "Q",
    margin: 2,
    color: { dark, light },
  });
}
