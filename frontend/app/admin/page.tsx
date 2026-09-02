import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { getRepo } from "@/lib/server/repo";
import GraphiqueAdmin from "@/components/GraphiqueAdmin";
import { PLANS } from "@/lib/data";
import { plafondPour, SEUIL_ALERTE } from "@/lib/server/sms/quota";

/**
 * Console d'administration — lecture seule.
 *
 * POURQUOI PAS UN OUTIL WEB DE BASE DE DONNÉES
 *
 * Adminer, phpMyAdmin ou pgAdmin exposés sur un domaine public sont l'une des
 * voies d'intrusion les plus courantes des petits SaaS : une seule faille dans
 * l'outil, et c'est la base entière — donc les données personnelles des
 * artisans et de LEURS clients. Cette page ne peut rien écrire et rien
 * exporter.
 *
 * CE QU'ELLE NOMME, ET CE QU'ELLE TAIT
 *
 * Elle nomme les entreprises — savoir QUI est en essai, et pas seulement
 * combien, est ce qui permet d'agir avant l'échéance. Elle ne montre aucune
 * coordonnée : ni e-mail, ni téléphone, ni nom de personne. Le nom d'une
 * entreprise est déjà public sur Google Maps ; l'adresse du client, elle, ne
 * doit pas transiter par une page web.
 *
 * Pour joindre quelqu'un, `db/lister-essais.sh` donne les adresses depuis le
 * serveur, à qui a déjà l'accès SSH.
 *
 * POURQUOI 404 ET NON 403
 *
 * Un 403 confirme que l'adresse existe et qu'il suffit du bon compte. Un 404
 * ne dit rien. Pour qui n'est pas administrateur, cette page n'existe pas.
 *
 * LE RÔLE EST RELU À CHAQUE REQUÊTE
 *
 * Il n'est pas mis dans le cookie de session : un rôle retiré doit prendre
 * effet immédiatement, pas à l'expiration du jeton de l'intéressé.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Administration",
  // Cette page ne doit jamais apparaître dans un moteur de recherche.
  robots: { index: false, follow: false },
};

/**
 * Une liste d'entreprises.
 *
 * Le cas vide n'est pas escamoté : une section absente se confond avec une
 * panne, alors qu'un « aucun » explicite est une information juste.
 */
function listeEntreprises<T extends { entreprise: string }>(
  titre: string,
  lignes: T[],
  vide: string,
  droite: (l: T) => { texte: string; urgent?: boolean },
) {
  return (
    <section className="admin-bloc">
      <h2 className="admin-section">
        {titre} {lignes.length > 0 && <span className="admin-compte">{lignes.length}</span>}
      </h2>
      {lignes.length === 0 ? (
        <p className="admin-vide">{vide}</p>
      ) : (
        lignes.map((l) => {
          const d = droite(l);
          return (
            <div className="admin-ligne" key={l.entreprise + d.texte}>
              <span className="admin-label">{l.entreprise}</span>
              <span className={d.urgent ? "admin-valeur admin-urgent" : "admin-valeur"}>
                {d.texte}
              </span>
            </div>
          );
        })
      )}
    </section>
  );
}

function ligne(label: string, valeur: string | number) {
  return (
    <div className="admin-ligne" key={label}>
      <span className="admin-label">{label}</span>
      <span className="admin-valeur">{valeur}</span>
    </div>
  );
}

export default async function Page() {
  const jar = await cookies();
  const session = await verifySession(jar.get(sessionCookie.name)?.value);
  if (!session) redirect("/connexion");

  const repo = getRepo();
  const utilisateur = await repo.findUserById(session.uid);
  if (!utilisateur || utilisateur.role !== "admin") notFound();

  const s = await repo.statistiquesAdmin();
  const francs = (centimes: number) =>
    `${(centimes / 100).toLocaleString("fr-CH", { minimumFractionDigits: 2 })} CHF`;
  const nomPalier = (id: string) => PLANS.find((p) => p.id === id)?.name ?? id;
  /*
   * Les statuts viennent de Stripe et sont en anglais. Les afficher bruts
   * donnait « — dont « trialing » » : lisible pour qui a écrit le code, opaque
   * pour qui lit la page. Le défaut n'est pas cosmétique — un tableau de bord
   * qu'on doit traduire mentalement est un tableau de bord qu'on cesse de
   * lire.
   */
  const nomStatut = (id: string) =>
    ({
      trialing: "en essai",
      active: "abonnement actif",
      past_due: "paiement en échec",
      canceled: "résilié",
      incomplete: "inscription non terminée",
    })[id] ?? id;

  return (
    <main className="admin">
      <h1 className="admin-titre">Administration</h1>
      <p className="admin-sous-titre">
        Lecture seule. Aucune donnée personnelle n&apos;est affichée ici.
      </p>

      {/* LES QUATRE CHIFFRES DU MATIN.
          En tête et en grand, parce que ce sont ceux qu'on vient chercher.
          Le reste du tableau sert à comprendre pourquoi ils bougent. */}
      <section className="admin-kpis">
        <div className="kpi">
          <span className="kpi-valeur">{s.abonnesActifs}</span>
          <span className="kpi-label">Abonnés payants</span>
        </div>
        <div className="kpi">
          {/* Le MRR dit ce que vaut le mois PROCHAIN. Le cumul des factures,
              lui, ne raconte que le passé. */}
          <span className="kpi-valeur">{francs(s.mrrCentimes)}</span>
          <span className="kpi-label">Revenu mensuel récurrent</span>
        </div>
        <div className="kpi">
          <span className="kpi-valeur">{s.essaisEnCours}</span>
          <span className="kpi-label">Essais en cours</span>
        </div>
        <div className="kpi">
          <span className="kpi-valeur">
            {(s.tauxConversionPourMille / 10).toFixed(1)} %
          </span>
          <span className="kpi-label">Taux de conversion</span>
        </div>
      </section>

      {/* QUI, avant les courbes. Les graphiques racontent une tendance ;
          ces trois listes disent qui appeler cette semaine. */}
      {listeEntreprises(
        "Abonnés payants",
        s.abonnes,
        "Aucun abonnement payant pour l'instant.",
        (l) => ({ texte: l.palier ? nomPalier(l.palier) : "—" }),
      )}

      {listeEntreprises(
        "Essais en cours",
        s.essais,
        "Aucun essai en cours.",
        (l) => ({
          texte:
            l.joursRestants === null
              ? "—"
              : l.joursRestants <= 1
                ? "dernier jour"
                : `${l.joursRestants} jours`,
          // Deux jours, c'est le délai pour décrocher son téléphone : le SMS de
          // rappel part la veille, et après il est trop tard pour parler.
          urgent: l.joursRestants !== null && l.joursRestants <= 2,
        }),
      )}

      {listeEntreprises(
        "En attente de fiche Google",
        s.attenteFiche,
        "Aucun compte en attente.",
        () => ({ texte: "essai non démarré" }),
      )}

      <GraphiqueAdmin titre="Inscriptions — 30 jours" points={s.parJour} mesure="inscriptions" />
      <GraphiqueAdmin titre="Revenus — 12 mois" points={s.parMois} mesure="revenu" />
      <GraphiqueAdmin titre="Inscriptions — 12 mois" points={s.parMois} mesure="inscriptions" />

      <section className="admin-bloc">
        <h2 className="admin-section">Comptes</h2>
        {ligne("Utilisateurs", s.comptes)}
        {ligne("Entreprises", s.entreprises)}
        {ligne("Fiches Google rattachées", s.fiches)}
      </section>

      <section className="admin-bloc">
        <h2 className="admin-section">Cycle de vie des abonnements</h2>
        {ligne("Abonnés payants", s.abonnesActifs)}
        {ligne("Essais en cours", s.essaisEnCours)}
        {/* Compté à part : un essai expiré non converti est un client perdu,
            et c'est le chiffre qui doit inquiéter quand il monte. */}
        {ligne("Essais expirés, non convertis", s.essaisExpires)}
        {Object.entries(s.abonnements).map(([k, v]) => ligne(`— dont ${nomStatut(k)}`, v))}
      </section>

      <section className="admin-bloc">
        <h2 className="admin-section">Répartition par palier</h2>
        {Object.entries(s.paliers).length === 0
          ? ligne("Aucun", "—")
          : Object.entries(s.paliers).map(([k, v]) => ligne(nomPalier(k), v))}
      </section>

      <section className="admin-bloc">
        <h2 className="admin-section">Avis</h2>
        {ligne("Avis connus", s.avis)}
        {ligne("Réponses à valider", s.avisEnAttente)}
        {ligne("Demandes d'avis envoyées", s.demandesAvis)}
        {ligne("Désabonnements SMS", s.desabonnements)}
      </section>

      {/* D'où vient le total. Un chiffre global qui double sans qu'on sache
          quel compte l'a fait doubler ne permet aucune décision. */}
      {listeEntreprises(
        "SMS ce mois, par client",
        s.smsParEntreprise,
        "Aucun SMS envoyé ce mois.",
        (l) => {
          // Le plafond avec le compteur : « 42 » ne dit rien, « 42 / 150 » dit
          // s'il faut s'en inquiéter.
          const plafond = plafondPour(l.palier ?? "basique");
          return {
            texte: `${l.envoyes} / ${plafond}`,
            // Au-delà de 80 %, c'est le moment de proposer le palier
            // au-dessus — avant que le client ne se heurte au mur.
            urgent: l.envoyes >= plafond * SEUIL_ALERTE,
          };
        },
      )}

      <section className="admin-bloc">
        <h2 className="admin-section">Coûts et facturation</h2>
        {/* Le poste qui monte vraiment : un SMS coûte dix à cinquante fois une
            réponse générée par l'IA. C'est le chiffre à surveiller. */}
        {ligne("SMS envoyés ce mois", s.smsCeMois)}
        {ligne("Factures émises", s.facturesEmises)}
        {ligne("Montant facturé", francs(s.montantFactureCentimes))}
      </section>
    </main>
  );
}
