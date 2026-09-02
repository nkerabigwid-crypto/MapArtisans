import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession, sessionCookie } from "@/lib/server/session";
import { getRepo } from "@/lib/server/repo";
import GraphiqueAdmin from "@/components/GraphiqueAdmin";
import { PLANS } from "@/lib/data";

/**
 * Console d'administration — lecture seule.
 *
 * POURQUOI PAS UN OUTIL WEB DE BASE DE DONNÉES
 *
 * Adminer, phpMyAdmin ou pgAdmin exposés sur un domaine public sont l'une des
 * voies d'intrusion les plus courantes des petits SaaS : une seule faille dans
 * l'outil, et c'est la base entière — donc les données personnelles des
 * artisans et de LEURS clients. Cette page ne peut rien écrire, rien exporter,
 * et ne montre que des agrégats.
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
        {Object.entries(s.abonnements).map(([k, v]) => ligne(`— dont « ${k} »`, v))}
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
