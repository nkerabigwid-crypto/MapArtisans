import type { Post } from "@/lib/data";

interface PostsViewProps {
  posts: Post[];
  onRegenerate: (postId: string) => void;
}

const STATUS_LABEL: Record<Post["status"], string> = {
  published: "Publié",
  scheduled: "Prévu",
  draft: "Brouillon",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export default function PostsView({ posts, onRegenerate }: PostsViewProps) {
  const sorted = [...posts].sort(
    (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
  );
  const next = sorted.find((p) => p.status === "scheduled");

  /*
   * Sans cette sortie, une carte vide s'affichait : un rectangle blanc sous
   * « Ce mois-ci », sans un mot. L'artisan ne pouvait pas distinguer « rien
   * n'est encore prévu » de « quelque chose est cassé ».
   *
   * Le texte dit ce qui manque ET pourquoi. Tant que la fiche Google n'est
   * pas rattachée, aucune publication ne peut être proposée : le mentionner
   * évite d'attendre devant un écran qui ne changera pas.
   */
  if (sorted.length === 0) {
    return (
      <section className="view" aria-label="Posts">
        <div className="section-label">Ce mois-ci</div>
        <p className="vue-vide">
          Aucune publication pour l&apos;instant. Dès que votre fiche Google sera
          rattachée, MapArtisans vous en proposera, prêtes à relire avant
          publication.
        </p>
      </section>
    );
  }

  return (
    <section className="view" aria-label="Posts">
      <div className="section-label">Ce mois-ci</div>
      <div className="card">
        {sorted.map((post) => (
          <div key={post.id} className="post-item">
            <div className="content">{post.content}</div>
            <div className="post-meta">
              <span className="date">
                {STATUS_LABEL[post.status]} · {formatDate(post.scheduled_at)}
              </span>
              {post.id === next?.id ? (
                <button className="link-btn hit-44" onClick={() => onRegenerate(post.id)}>
                  Régénérer
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
