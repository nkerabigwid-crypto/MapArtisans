// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import PDFDocument from "pdfkit";
import { calculerTotaux, formatCHF, type BaseDePrix, type RegimeTva } from "./vat";

/**
 * Génération de la facture PDF.
 *
 * L'ÉMETTEUR EST LA SOCIÉTÉ ÉDITRICE, PAS LA MARQUE
 *
 * MapArtisans se présente seule partout dans le produit — c'est la décision
 * prise sur l'identité de marque. La facture est l'exception nécessaire : un
 * document comptable doit identifier l'entité juridique qui encaisse, avec sa
 * raison sociale, son adresse et, si elle est assujettie, son numéro IDE.
 * Une facture au seul nom d'une marque commerciale n'est pas opposable.
 *
 * CE MODULE N'ÉMET PAS DE FACTURE AU NOM D'UN TIERS
 *
 * La proposition initiale prévoyait que le système émette aussi les factures
 * d'une agence à ses propres artisans, avec les coordonnées fiscales de
 * l'agence. C'est écarté : produire un document fiscal au nom d'un tiers
 * engage sa responsabilité sur des données que nous ne contrôlons pas (statut
 * d'assujettissement, IDE, adresse légale). Une erreur de notre côté devient
 * une facture non conforme émise sous SON nom.
 */

export interface PartieFacture {
  raisonSociale: string;
  adresse: string[];
  email?: string;
}

export interface DonneesFacture {
  numero: string;
  emiseLe: Date;
  payeeLe: Date | null;
  emetteur: PartieFacture;
  client: PartieFacture;
  designation: string;
  /** Montant affiché, en centimes. */
  montantCentimes: number;
  regime: RegimeTva;
  base?: BaseDePrix;
}

const MARGE = 56;

function jour(d: Date): string {
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Produit le PDF et le renvoie sous forme de Buffer, prêt à être joint à un
 * e-mail ou déposé dans un stockage objet.
 *
 * RÉTENTION : le Code des obligations impose de conserver les pièces
 * comptables dix ans. Le Buffer doit donc être écrit dans un stockage durable,
 * pas seulement envoyé par e-mail — une boîte de réception n'est pas une
 * archive comptable.
 */
export function genererFacturePdf(donnees: DonneesFacture): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Le calcul est DANS la promesse, volontairement : une fonction qui
    // annonce `Promise<Buffer>` mais lève de façon synchrone échappe à un
    // appelant qui n'utilise que `.catch()`. Une facture dont l'erreur passe
    // inaperçue est une facture qui n'est jamais envoyée au client.
    const totaux = calculerTotaux(donnees.montantCentimes, donnees.regime, donnees.base);

    const doc = new PDFDocument({ size: "A4", margin: MARGE });
    const morceaux: Buffer[] = [];
    doc.on("data", (m: Buffer) => morceaux.push(m));
    doc.on("end", () => resolve(Buffer.concat(morceaux)));
    doc.on("error", reject);

    const largeur = doc.page.width - MARGE * 2;
    const droite = doc.page.width - MARGE;

    // --- En-tête : émetteur à gauche, numéro et dates à droite.
    doc.fontSize(18).fillColor("#123f6d").text(donnees.emetteur.raisonSociale, MARGE, MARGE);
    doc.fontSize(9).fillColor("#444444");
    for (const l of donnees.emetteur.adresse) doc.text(l);
    if (donnees.regime.assujetti) doc.text(`IDE : ${donnees.regime.numeroIde}`);

    doc.fontSize(9).fillColor("#444444");
    doc.text(`Facture ${donnees.numero}`, MARGE, MARGE, { width: largeur, align: "right" });
    doc.text(`Émise le ${jour(donnees.emiseLe)}`, { width: largeur, align: "right" });
    doc.text(
      donnees.payeeLe ? `Payée le ${jour(donnees.payeeLe)}` : "En attente de paiement",
      { width: largeur, align: "right" },
    );

    // --- Client.
    doc.moveDown(3);
    const yClient = doc.y;
    doc.fontSize(8).fillColor("#888888").text("FACTURÉ À", MARGE, yClient);
    doc.fontSize(10).fillColor("#111111").text(donnees.client.raisonSociale);
    doc.fontSize(9).fillColor("#444444");
    for (const l of donnees.client.adresse) doc.text(l);
    if (donnees.client.email) doc.text(donnees.client.email);

    // --- Ligne de prestation.
    doc.moveDown(2.5);
    let y = doc.y;
    doc.moveTo(MARGE, y).lineTo(droite, y).strokeColor("#dddddd").stroke();
    y += 10;
    doc.fontSize(8).fillColor("#888888").text("DÉSIGNATION", MARGE, y);
    doc.text("MONTANT CHF", MARGE, y, { width: largeur, align: "right" });
    y += 16;
    doc.fontSize(10).fillColor("#111111").text(donnees.designation, MARGE, y, {
      width: largeur - 110,
    });
    doc.text(formatCHF(totaux.htCentimes), MARGE, y, { width: largeur, align: "right" });
    y = Math.max(doc.y, y + 14) + 8;
    doc.moveTo(MARGE, y).lineTo(droite, y).strokeColor("#dddddd").stroke();

    // --- Totaux.
    y += 12;
    const ligne = (libelle: string, valeur: string, gras = false) => {
      doc.fontSize(gras ? 11 : 9).fillColor(gras ? "#111111" : "#444444");
      doc.text(libelle, MARGE, y, { width: largeur - 90, align: "right" });
      doc.text(valeur, MARGE, y, { width: largeur, align: "right" });
      y += gras ? 18 : 14;
    };

    if (totaux.taux === null) {
      ligne("Total CHF", formatCHF(totaux.ttcCentimes), true);
      // Mention explicite : sans elle, un client se demande où est la TVA et
      // son comptable aussi. La dire évite l'appel au support.
      doc.fontSize(8).fillColor("#888888");
      doc.text(
        "Non assujetti à la TVA (chiffre d'affaires inférieur au seuil légal de 100 000 CHF).",
        MARGE,
        y + 4,
        { width: largeur, align: "right" },
      );
      y += 20;
    } else {
      ligne("Sous-total HT CHF", formatCHF(totaux.htCentimes));
      ligne(`TVA ${(totaux.taux * 100).toFixed(1)} % CHF`, formatCHF(totaux.tvaCentimes));
      ligne("Total CHF", formatCHF(totaux.ttcCentimes), true);
    }

    // --- Pied de page.
    doc.fontSize(8).fillColor("#888888");
    doc.text(
      donnees.payeeLe
        ? "Facture acquittée — merci pour votre confiance."
        : "Merci de régler cette facture à réception.",
      MARGE,
      doc.page.height - MARGE - 14,
      { width: largeur, align: "center" },
    );

    doc.end();
  });
}
