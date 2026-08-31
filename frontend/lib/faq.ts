/**
 * Questions fréquentes par métier — base de départ de l'assistant.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * `assistant_settings.faq_context` attend une base de connaissances rédigée
 * par l'artisan. Aucun ne le fera : il est sous un évier ou au volant. Sans
 * base de départ, l'assistant du palier Professionnel répondrait « je ne sais pas »
 * à tout, dès la première minute.
 *
 * LA CONTRAINTE QUI GOUVERNE CHAQUE LIGNE
 *
 * Ces réponses partent au nom de l'artisan, sans qu'il les ait relues. Elles
 * ne peuvent donc contenir NI prix, NI délai, NI promesse de disponibilité :
 * ce sont des informations propres à chaque entreprise, et les inventer
 * engagerait quelqu'un qui n'a rien signé.
 *
 * Ce qu'elles contiennent à la place : la façon de répondre, et le renvoi
 * explicite vers l'artisan pour tout ce qui l'engage. C'est moins spectaculaire
 * qu'un tarif affiché, et c'est la seule version publiable.
 */

export interface QuestionFrequente {
  question: string;
  /** Consigne de réponse, injectée dans le prompt. Jamais une réponse figée. */
  reponse: string;
}

/**
 * Questions posées à tous les métiers.
 *
 * Un client qui cherche un serrurier et un client qui cherche un coiffeur
 * demandent les mêmes trois choses avant tout : « vous venez chez moi ? »,
 * « c'est combien ? », « quand ? ». Les écrire une fois évite vingt copies qui
 * finiraient par diverger.
 */
export const QUESTIONS_COMMUNES: QuestionFrequente[] = [
  {
    question: "Quels sont vos tarifs ?",
    reponse:
      "Ne donne aucun chiffre : les tarifs dépendent de chaque situation et " +
      "seule l'entreprise peut les annoncer. Propose de transmettre la demande " +
      "pour qu'elle rappelle avec un montant ferme.",
  },
  {
    question: "Quand pouvez-vous intervenir ?",
    reponse:
      "N'annonce aucun délai. Demande quand le client souhaiterait, note-le, et " +
      "explique que l'entreprise confirme la disponibilité en rappelant.",
  },
  {
    question: "Intervenez-vous dans ma commune ?",
    reponse:
      "Réponds à partir de la zone d'intervention indiquée dans la base de " +
      "connaissances. Si elle n'y figure pas, demande la localité et transmets " +
      "la question plutôt que de supposer.",
  },
  {
    question: "Comment vous joindre ?",
    reponse:
      "Propose de laisser un nom, un numéro et le motif. N'invente jamais un " +
      "numéro de téléphone ni une adresse e-mail.",
  },
];

/** Questions propres à un métier, en plus des communes. */
export const QUESTIONS_PAR_METIER: Record<string, QuestionFrequente[]> = {
  plombier: [
    {
      question: "J'ai une fuite, que faire en attendant ?",
      reponse:
        "Conseille de fermer le robinet d'arrêt général et de couper l'électricité " +
        "si l'eau approche d'une prise. Ce sont des gestes de sécurité, pas un " +
        "diagnostic : n'essaie pas d'identifier la panne à distance.",
    },
    {
      question: "Faites-vous les dépannages d'urgence ?",
      reponse:
        "Indique si la base de connaissances mentionne un service d'urgence. Sinon, " +
        "demande la nature du problème et transmets la demande sans promettre de délai.",
    },
    {
      question: "Installez-vous des chauffe-eau ?",
      reponse:
        "Réponds à partir de la liste de prestations si elle est renseignée. Ne " +
        "détaille aucune marque ni modèle qui n'y figure pas.",
    },
  ],
  electricien: [
    {
      question: "Mon tableau électrique disjoncte, est-ce grave ?",
      reponse:
        "Conseille de ne pas réarmer en boucle et de débrancher les appareils " +
        "récemment ajoutés. Ne pose aucun diagnostic : un tableau qui disjoncte " +
        "peut venir de dix causes différentes.",
    },
    {
      question: "Faites-vous les mises aux normes ?",
      reponse: "Réponds selon les prestations renseignées, sans citer de norme précise.",
    },
  ],
  chauffagiste: [
    {
      question: "Ma chaudière ne démarre plus.",
      reponse:
        "Demande la marque et le message affiché s'il y en a un, pour que " +
        "l'entreprise arrive préparée. Ne propose aucune manipulation interne.",
    },
    {
      question: "Faut-il un entretien annuel ?",
      reponse:
        "Indique que l'entretien régulier est recommandé et que l'entreprise " +
        "précisera la fréquence adaptée à l'installation.",
    },
  ],
  serrurier: [
    {
      question: "Je suis enfermé dehors, pouvez-vous venir ?",
      reponse:
        "C'est une urgence : demande immédiatement la localité et un numéro, et " +
        "transmets sans faire patienter par des questions secondaires.",
    },
    {
      question: "Allez-vous casser ma porte ?",
      reponse:
        "Explique que l'ouverture sans dommage est recherchée en priorité, mais " +
        "que cela dépend de la serrure et que seule l'entreprise peut le dire sur place.",
    },
  ],
  menuisier: [
    {
      question: "Travaillez-vous sur mesure ?",
      reponse: "Réponds selon les prestations renseignées et propose de noter le projet.",
    },
  ],
  peintre: [
    {
      question: "Préparez-vous les murs avant de peindre ?",
      reponse:
        "Explique que la préparation fait partie du travail, sans détailler " +
        "d'étapes ni de produits qui ne sont pas renseignés.",
    },
  ],
  macon: [
    {
      question: "Faites-vous les petites réparations ?",
      reponse: "Demande la nature et la surface concernée, puis transmets la demande.",
    },
  ],
  couvreur: [
    {
      question: "Mon toit fuit, est-ce urgent ?",
      reponse:
        "Conseille de placer un récipient et d'écarter ce qui craint l'eau. " +
        "Demande depuis quand, pour que l'entreprise mesure l'urgence.",
    },
  ],
  vitrier: [
    {
      question: "Une vitre est cassée, que faire ?",
      reponse:
        "Conseille d'éloigner enfants et animaux et de ne pas ramasser les éclats " +
        "à mains nues. Demande les dimensions approximatives si elles sont visibles.",
    },
  ],
  carreleur: [
    {
      question: "Posez-vous sur un ancien carrelage ?",
      reponse: "Réponds que cela dépend de l'état du support, que l'entreprise vérifiera.",
    },
  ],

  // --- Transport de personnes.
  taxi: [
    {
      question: "Faites-vous les transferts vers l'aéroport ?",
      reponse:
        "Réponds selon les prestations renseignées. Demande la date, l'heure du " +
        "vol et le nombre de passagers pour préparer la course.",
    },
    {
      question: "Combien coûte la course jusqu'à…",
      reponse:
        "Ne donne aucun montant : les tarifs varient selon l'heure, le trajet et " +
        "les bagages. Note la destination et propose que l'entreprise confirme.",
    },
    {
      question: "Acceptez-vous les paiements par carte ?",
      reponse:
        "Réponds uniquement si le moyen de paiement figure dans la base de " +
        "connaissances. Ne suppose rien.",
    },
    {
      question: "Combien de passagers pouvez-vous prendre ?",
      reponse:
        "Réponds selon le véhicule renseigné. Demande le nombre de personnes et de " +
        "valises : c'est ce qui détermine si la course est possible.",
    },
  ],
  vtc: [
    {
      question: "Faut-il réserver à l'avance ?",
      reponse:
        "Explique que la réservation est préférable et propose de noter la demande " +
        "tout de suite, sans promettre de disponibilité.",
    },
    {
      question: "Puis-je réserver pour quelqu'un d'autre ?",
      reponse:
        "Oui. Demande le nom et le numéro du passager, en plus de ceux du " +
        "demandeur : c'est le passager que le chauffeur doit joindre.",
    },
  ],
  transfert_aeroport: [
    {
      question: "Attendez-vous si mon vol a du retard ?",
      reponse:
        "Ne t'engage pas : demande le numéro de vol et transmets. C'est l'entreprise " +
        "qui décide de sa politique d'attente.",
    },
    {
      question: "Combien de bagages puis-je emporter ?",
      reponse:
        "Demande le nombre et le format des bagages. C'est ce qui détermine le " +
        "véhicule nécessaire, et donc la faisabilité.",
    },
  ],

  // --- Automobile.
  garage: [
    {
      question: "Faites-vous les révisions constructeur ?",
      reponse:
        "Réponds selon les prestations renseignées. Demande la marque, le modèle " +
        "et le kilométrage pour que l'atelier prépare le rendez-vous.",
    },
    {
      question: "Prêtez-vous un véhicule pendant la réparation ?",
      reponse:
        "Réponds uniquement si l'information est renseignée. Ne le promets jamais " +
        "de toi-même.",
    },
    {
      question: "Ma voiture fait un bruit, c'est quoi ?",
      reponse:
        "Ne pose aucun diagnostic. Demande depuis quand, à quel moment le bruit " +
        "apparaît, et propose un passage à l'atelier.",
    },
  ],
  carrosserie: [
    {
      question: "Travaillez-vous avec les assurances ?",
      reponse:
        "Réponds selon la base de connaissances. Demande si un constat existe déjà : " +
        "c'est la première question que posera l'entreprise.",
    },
  ],
  depannage_auto: [
    {
      question: "Je suis en panne, dans combien de temps arrivez-vous ?",
      reponse:
        "N'annonce aucun délai. Demande immédiatement la localisation précise, le " +
        "type de véhicule et un numéro joignable, puis transmets en urgence.",
    },
  ],

  // --- Services de proximité.
  coiffeur: [
    {
      question: "Faut-il prendre rendez-vous ?",
      reponse:
        "Propose de noter un rendez-vous. Précise que le salon confirme le créneau.",
    },
    {
      question: "Faites-vous les colorations ?",
      reponse:
        "Réponds selon les prestations renseignées. Pour une coloration, demande la " +
        "longueur des cheveux : cela change la durée du rendez-vous.",
    },
  ],
  barbier: [
    {
      question: "Prenez-vous sans rendez-vous ?",
      reponse: "Réponds selon la base de connaissances, sinon propose de noter un créneau.",
    },
  ],
  institut_beaute: [
    {
      question: "Combien de temps dure un soin ?",
      reponse:
        "Réponds selon les prestations renseignées. Si la durée n'y figure pas, " +
        "propose de la faire confirmer lors de la prise de rendez-vous.",
    },
  ],
  autre: [],
};

/**
 * Base de connaissances par défaut pour un métier.
 *
 * Utilisée quand l'artisan n'a rien écrit. Elle ne prétend pas remplacer ce
 * qu'il seul sait — zone d'intervention, horaires, moyens de paiement — mais
 * elle évite l'assistant qui ne sait rien répondre le premier jour.
 */
export function faqParDefaut(tradeSlug: string): QuestionFrequente[] {
  return [...QUESTIONS_COMMUNES, ...(QUESTIONS_PAR_METIER[tradeSlug] ?? [])];
}

/** Met la base en forme pour le prompt système de l'assistant. */
export function formaterFaqPourPrompt(questions: QuestionFrequente[]): string {
  return questions.map((q) => `Q : ${q.question}\nR : ${q.reponse}`).join("\n\n");
}
