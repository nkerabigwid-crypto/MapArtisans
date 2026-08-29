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
