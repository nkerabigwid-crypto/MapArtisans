/**
 * Questions fréquentes publiques.
 *
 * DESTINÉES AUX ARTISANS, PAS À LEURS CLIENTS
 *
 * Ce sont les questions que tape un plombier ou un chauffeur de taxi qui se
 * demande pourquoi il n'apparaît pas : « pourquoi je ne suis pas dans le top 3
 * Google Maps », « comment avoir plus d'avis ». Ce sont donc des prospects.
 *
 * CHAQUE RÉPONSE EST VÉRIFIABLE
 *
 * Le secteur vend beaucoup de mythes — le « Top 3 garanti », les posts qui
 * élargiraient le rayon, les avis triés. Les réponses ci-dessous s'appuient
 * sur des sources officielles, citées quand elles existent. C'est le seul
 * angle défendable pour un produit qui vend de la conformité : dire vrai est
 * ici un argument commercial, pas une contrainte.
 *
 * Aucune ne promet de position. Aucune ne garantit de résultat.
 */

export interface QuestionPublique {
  question: string;
  /** Réponse en HTML léger : <p>, <strong>, <a> uniquement. */
  reponse: string;
}

export interface SectionFaq {
  titre: string;
  questions: QuestionPublique[];
}

export const FAQ_PUBLIQUE: SectionFaq[] = [
  {
    titre: "Apparaître sur Google Maps",
    questions: [
      {
        question: "Pourquoi je n'apparais pas dans les résultats Google Maps ?",
        reponse:
          "<p>Google classe les fiches sur trois critères qu'il publie lui-même : la " +
          "<strong>pertinence</strong> (votre fiche correspond-elle à la recherche), la " +
          "<strong>distance</strong> (à quelle distance êtes-vous de la personne qui cherche) et la " +
          "<strong>notoriété</strong> (nombre d'avis, sites qui parlent de vous).</p>" +
          "<p>Une fiche incomplète perd sur la pertinence. Une fiche sans avis perd sur la " +
          "notoriété. La distance, elle, ne se corrige pas : elle dépend de votre adresse.</p>",
      },
      {
        question: "Combien d'entreprises apparaissent dans les résultats locaux ?",
        reponse:
          "<p><strong>Trois.</strong> C'est ce qu'on appelle le Local Pack. Les suivantes ne " +
          "sont visibles qu'après un clic sur « Plus de résultats », que la plupart des gens " +
          "ne font pas.</p>" +
          "<p>C'est pourquoi être 4e ou 12e change assez peu de choses en pratique : dans les " +
          "deux cas, on ne vous voit pas.</p>",
      },
      {
        question: "Peut-on garantir la première place sur Google Maps ?",
        reponse:
          "<p><strong>Non, et méfiez-vous de qui vous le promet.</strong> Le classement dépend " +
          "de l'algorithme de Google, de vos concurrents, et de l'endroit d'où la personne " +
          "cherche — trois choses qu'aucun prestataire ne contrôle.</p>" +
          "<p>Ce qu'on peut faire : travailler ce qui dépend de vous, et vous montrer " +
          "précisément où vous en êtes, quartier par quartier.</p>",
      },
      {
        question: "Est-ce que je peux apparaître dans une ville où je ne suis pas installé ?",
        reponse:
          "<p>Difficilement. La distance se mesure depuis votre adresse enregistrée. Publier " +
          "des messages depuis un autre quartier ne rapproche pas votre fiche de ce quartier.</p>" +
          "<p>Ce qui aide : renseigner correctement votre zone d'intervention, et être " +
          "réellement mentionné sur des sites liés à ces communes.</p>",
      },
    ],
  },
  {
    titre: "Les avis clients",
    questions: [
      {
        question: "Puis-je demander des avis uniquement à mes clients satisfaits ?",
        reponse:
          "<p><strong>Non, Google l'interdit explicitement.</strong> Ses règles prohibent de " +
          "« décourager ou interdire les avis négatifs, ou solliciter sélectivement les avis " +
          "positifs ».</p>" +
          "<p>Les outils qui proposent de filtrer les clients avant de les envoyer sur Google " +
          "font courir un risque à votre fiche : suppression des avis, pénalité, parfois " +
          "suspension. Demandez à tout le monde, ou à personne.</p>",
      },
      {
        question: "Faut-il répondre aux avis négatifs ?",
        reponse:
          "<p>Oui, et c'est souvent plus utile que de répondre aux avis positifs. Un futur " +
          "client lit surtout la réponse, pas la critique.</p>" +
          "<p>Une réponse mesurée, qui ne discute pas les faits et propose de poursuivre en " +
          "privé, rassure. Une réponse qui se justifie ou conteste fait l'inverse.</p>",
      },
      {
        question: "Puis-je afficher mes avis Google sur mon site pour avoir des étoiles ?",
        reponse:
          "<p>Vous pouvez les afficher, mais ils n'apparaîtront pas en étoiles dans les " +
          "résultats de recherche. Google précise que lorsque l'entreprise notée contrôle " +
          "les avis publiés sur son propre site, la page n'est pas éligible aux étoiles — " +
          "et cite nommément le cas des widgets d'avis Google.</p>" +
          "<p>Beaucoup de sites d'artisans portent ce balisage sans le savoir. Il ne sert à " +
          "rien et expose à une sanction.</p>",
      },
      {
        question: "Un QR code pour récolter des avis, est-ce autorisé ?",
        reponse:
          "<p>Oui, à une condition : il doit être présenté à <strong>tous</strong> les " +
          "clients, et mener directement au formulaire d'avis Google.</p>" +
          "<p>Ce qui n'est pas autorisé, c'est de faire passer le client par une page qui lui " +
          "demande d'abord une note et n'envoie sur Google que les plus satisfaits.</p>",
      },
    ],
  },
  {
    titre: "Le référencement local en pratique",
    questions: [
      {
        question: "Faut-il un site internet quand on a déjà une fiche Google ?",
        reponse:
          "<p>Pas indispensable pour apparaître, mais utile. Un site cohérent avec votre " +
          "fiche — mêmes nom, adresse et téléphone — renforce la confiance que Google " +
          "accorde à l'ensemble.</p>" +
          "<p>Beaucoup d'artisans n'en ont pas, et s'en sortent très bien avec une fiche " +
          "bien tenue.</p>",
      },
      {
        question: "Qu'est-ce qu'une Geo-Grid ?",
        reponse:
          "<p>Une carte de votre visibilité, quartier par quartier. On mesure votre position " +
          "depuis plusieurs points de la ville, parce qu'elle n'est pas la même partout : " +
          "vous pouvez être 1er devant chez vous et 14e à trois kilomètres.</p>" +
          "<p>C'est la seule façon de voir où vous perdez réellement des clients.</p>",
      },
      {
        question: "Les annuaires servent-ils encore à quelque chose ?",
        reponse:
          "<p>Oui, pour la notoriété — à condition que vos coordonnées y soient " +
          "<strong>identiques partout</strong>. Un numéro qui diffère d'un annuaire à " +
          "l'autre affaiblit ce qu'il devrait renforcer.</p>" +
          "<p>Mieux vaut cinq inscriptions exactes que vingt approximatives.</p>",
      },
      {
        question: "Combien de temps avant de voir un résultat ?",
        reponse:
          "<p>Personne ne peut le dire honnêtement. Cela dépend de votre point de départ, de " +
          "vos concurrents et de la densité de votre ville.</p>" +
          "<p>Ce qu'on peut vous garantir, c'est la mesure : vous voyez chaque semaine où " +
          "vous en êtes, et si ça bouge ou non.</p>",
      },
    ],
  },
  {
    titre: "MapArtisans",
    questions: [
      {
        question: "Comment fonctionne la réponse automatique aux avis ?",
        reponse:
          "<p>Un avis à 4 ou 5 étoiles reçoit sa réponse tout seul, rédigée dans le " +
          "vocabulaire de votre métier et de votre ville.</p>" +
          "<p>En dessous, <strong>notre réponse n'est pas envoyée</strong> : un brouillon " +
          "est préparé et vous décidez. Nous ne répondons jamais à un client mécontent en " +
          "votre nom sans votre accord.</p>" +
          "<p><strong>L'avis du client, lui, reste visible.</strong> Nous ne masquons, ne " +
          "filtrons et ne retardons aucun avis — c'est votre réponse qui attend, jamais " +
          "l'avis.</p>",
      },
      {
        question: "Faut-il consulter un tableau de bord tous les jours ?",
        reponse:
          "<p>Non. Vous recevez un SMS par semaine : votre position, les appels et les " +
          "itinéraires générés depuis votre fiche. C'est tout.</p>" +
          "<p>Le tableau de bord existe si vous voulez regarder de plus près, mais il n'est " +
          "pas fait pour être ouvert chaque matin.</p>",
      },
      {
        question: "Puis-je arrêter quand je veux ?",
        reponse:
          "<p>Oui, en un clic depuis vos réglages, sans engagement ni frais de sortie. " +
          "L'essai de quatorze jours ne demande pas de carte bancaire.</p>" +
          "<p>Votre fiche Google reste la vôtre : nous cessons d'y publier, rien n'est " +
          "supprimé.</p>",
      },
    ],
  },
];

/** Toutes les questions, à plat. Utile au balisage et aux tests. */
export function toutesLesQuestions(): QuestionPublique[] {
  return FAQ_PUBLIQUE.flatMap((s) => s.questions);
}

/** Retire le HTML : le balisage Schema.org attend du texte brut. */
export function texteBrut(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
