// PAS de `import "server-only"` : même raison que les autres modules de
// lib/server/ — voir la note détaillée dans ai/openai.ts.
import { existsSync } from "node:fs";
import { join } from "node:path";
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

/**
 * Largeur du logo en points, sur une page A4 de 595 pt.
 *
 * Le fichier est RECADRÉ sur son dessin : sa version d'origine portait 244 px
 * de marge transparente à gauche, qui décalaient le logo vers la droite alors
 * que l'adresse dessous partait de la marge. Les deux ne s'alignaient pas, et
 * rien dans le code ne pouvait le montrer.
 *
 * La hauteur suit le rapport 770 × 149 du fichier recadré.
 */
const LARGEUR_LOGO = 165;
const HAUTEUR_LOGO = Math.round((LARGEUR_LOGO * 149) / 770);

export interface PartieFacture {
  raisonSociale: string;
  adresse: string[];
  email?: string;
  /**
   * Nom commercial, quand il differe de la raison sociale.
   *
   * POURQUOI LES DEUX FIGURENT
   *
   * Le client a souscrit a MapArtisans. Une facture signee du seul
   * « Valtransfer Nkerabigwi » porte un nom qu'il n'a jamais vu : il la
   * classe mal, la conteste, ou appelle sa banque.
   *
   * L'inverse ne marche pas non plus. Une raison individuelle DOIT etre
   * identifiee par son nom inscrit au registre du commerce — CO art. 945
   * impose qu'il contienne le nom de famille du titulaire. Une facture au
   * seul nom de l'enseigne n'identifie aucune personne responsable.
   *
   * D'ou la marque en tete, ou l'oeil la cherche, et la raison sociale
   * immediatement dessous, ou la loi l'exige.
   */
  marque?: string;
  /** IDE de l'emetteur, imprime meme hors assujettissement a la TVA. */
  ide?: string;
  /**
   * IBAN de l'emetteur, imprime dans la bande de pied de page.
   *
   * Il n'est PAS un ordre de paiement : nos factures sortent apres encaissement
   * par carte. Il repond a la question du comptable — sur quel compte cet
   * abonnement a-t-il ete regle — et sert le jour ou une facture partirait
   * avant paiement.
   */
  iban?: string;
  /** Numero de telephone de l'emetteur. */
  telephone?: string;
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

    /*
     * --- En-tête : émetteur à gauche, numéro et dates à droite.
     *
     * LE LOGO PLUTÔT QUE LE NOM COMPOSÉ.
     *
     * PDFKit n'embarque que les fontes de base : « MapArtisans » sortait donc
     * en Helvetica, une police que le produit n'emploie nulle part ailleurs.
     * L'image porte la vraie composition — Barlow Condensed et le repère —
     * celle que le client a vue sur le site et dans ses courriers.
     *
     * SI LE FICHIER MANQUE, ON COMPOSE LE NOM.
     *
     * Une facture est une pièce comptable obligatoire : elle doit sortir même
     * sans son logo. Le repli est le comportement d'avant, pas une erreur.
     */
    let basLogo = MARGE;
    let logoPose = false;
    if (donnees.emetteur.marque) {
      try {
        const chemin = join(process.cwd(), "public", "logo-facture.png");
        if (existsSync(chemin)) {
          doc.image(chemin, MARGE, MARGE, { width: LARGEUR_LOGO });
          basLogo = MARGE + HAUTEUR_LOGO;
          logoPose = true;
        }
      } catch {
        // Fichier illisible ou image invalide : on retombe sur le texte.
      }
    }

    if (!logoPose) {
      doc
        .fontSize(18)
        .fillColor("#123f6d")
        .text(donnees.emetteur.marque ?? donnees.emetteur.raisonSociale, MARGE, MARGE);
      basLogo = doc.y;
    }
    /*
     * Sous le logo, TOUT en petit.
     *
     * La raison sociale n'y est pas pour être lue en premier — le client
     * reconnaît la marque — mais parce que le CO l'exige sur une pièce
     * comptable. Elle doit donc être présente et lisible, pas mise en avant.
     * Au même corps que l'adresse, le bloc devient un pavé d'identification
     * discret sous un logo qui, lui, se voit.
     */
    doc.fontSize(8).fillColor("#666666");
    if (donnees.emetteur.marque) {
      doc.fillColor("#333333").text(donnees.emetteur.raisonSociale, MARGE, basLogo + 8);
      doc.fillColor("#666666");
    }
    for (const l of donnees.emetteur.adresse) doc.text(l);
    /*
     * Bas de la colonne GAUCHE, retenu avant d'écrire la colonne droite.
     *
     * `doc.y` suit le dernier texte écrit, quelle que soit la colonne. Après
     * l'en-tête de droite — trois lignes — il pointait donc plus haut que la
     * fin du bloc émetteur, et le bloc client venait se superposer à l'IDE.
     * Le défaut est apparu le jour où la marque et l'IDE ont allongé la
     * colonne gauche de deux lignes.
     */
    const basGauche = doc.y;

    doc.fontSize(9).fillColor("#444444");
    doc.text(`Facture ${donnees.numero}`, MARGE, MARGE, { width: largeur, align: "right" });
    doc.text(`Émise le ${jour(donnees.emiseLe)}`, { width: largeur, align: "right" });
    doc.text(
      donnees.payeeLe ? `Payée le ${jour(donnees.payeeLe)}` : "En attente de paiement",
      { width: largeur, align: "right" },
    );

    // --- Client. Il commence sous la PLUS BASSE des deux colonnes.
    const yClient = Math.max(basGauche, doc.y) + 34;
    doc.fontSize(8).fillColor("#888888").text("FACTURÉ À", MARGE, yClient);
    doc.fontSize(10).fillColor("#111111").text(donnees.client.raisonSociale);
    doc.fontSize(9).fillColor("#444444");
    for (const l of donnees.client.adresse) doc.text(l);
    /*
     * L'adresse ne se répète pas sous le nom quand les deux sont identiques.
     * Faute de nom d'entreprise, `raisonSociale` valait l'adresse e-mail, et
     * la facture l'imprimait deux fois de suite.
     */
    if (donnees.client.email && donnees.client.email !== donnees.client.raisonSociale) {
      doc.text(donnees.client.email);
    }

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

    /*
     * --- Pied de page : la bande de coordonnees.
     *
     * POURQUOI L'IDE ET L'E-MAIL NE SONT PLUS EN TETE
     *
     * Ils y etaient. Les repeter en bas ferait lire deux fois la meme chose sur
     * un document d'une seule page. Le partage est donc net : l'en-tete IDENTIFIE
     * l'emetteur — logo, raison sociale, adresse, ce que le CO exige ; le pied
     * rassemble ce dont le lecteur SE SERT — ou ecrire, ou appeler, ou payer.
     *
     * La bande sort meme incomplete : chaque element est optionnel, et une
     * facture ne doit jamais dependre d'une coordonnee pour etre emise.
     */
    const coordonnees: string[] = [];
    /*
     * L'IDE identifie l'entreprise au registre ; le numero de TVA atteste d'un
     * assujettissement. Les deux se ressemblent — CHE-xxx.xxx.xxx — et les
     * confondre ferait croire a une TVA due que nous ne facturons pas. D'ou
     * deux libelles distincts, et jamais les deux a la fois.
     */
    if (donnees.regime.assujetti) coordonnees.push(`N° TVA : ${donnees.regime.numeroIde}`);
    else if (donnees.emetteur.ide) coordonnees.push(`IDE : ${donnees.emetteur.ide}`);
    /*
     * L'adresse de contact de l'EMETTEUR : sans elle, la facture ne dit pas ou
     * ecrire pour la contester, demander un duplicata ou poser une question.
     * C'est aussi la seule ligne qui montre au client une adresse au nom du
     * domaine — sinon le seul e-mail visible serait le sien.
     */
    if (donnees.emetteur.email) coordonnees.push(donnees.emetteur.email);
    if (donnees.emetteur.telephone) coordonnees.push(donnees.emetteur.telephone);

    const lignesPied: string[] = [];
    if (coordonnees.length > 0) lignesPied.push(coordonnees.join("   ·   "));
    if (donnees.emetteur.iban) lignesPied.push(`IBAN ${donnees.emetteur.iban}`);

    const HAUTEUR_LIGNE_PIED = 11;
    /*
     * Ancre au BAS de la page, pas a la suite des totaux : la bande doit tomber
     * au meme endroit sur toutes les factures, qu'elles portent une ligne de
     * TVA ou non. On remonte du bord d'autant de lignes qu'on en a a poser, en
     * gardant 4 pt de garde sous la derniere pour que PDFKit ne juge pas le
     * texte deborde — il ouvrirait une seconde page vide.
     */
    let yPied = doc.page.height - MARGE - 4 - lignesPied.length * HAUTEUR_LIGNE_PIED;

    doc.fontSize(8).fillColor("#888888");
    doc.text(
      donnees.payeeLe
        ? "Facture acquittée — merci pour votre confiance."
        : "Merci de régler cette facture à réception.",
      MARGE,
      yPied - 26,
      { width: largeur, align: "center" },
    );

    if (lignesPied.length > 0) {
      doc.moveTo(MARGE, yPied - 10).lineTo(droite, yPied - 10).strokeColor("#dddddd").stroke();
      doc.fontSize(8).fillColor("#888888");
      for (const l of lignesPied) {
        doc.text(l, MARGE, yPied, { width: largeur, align: "center" });
        yPied += HAUTEUR_LIGNE_PIED;
      }
    }

    doc.end();
  });
}
