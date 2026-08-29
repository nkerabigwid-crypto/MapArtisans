"use client";

import { useState } from "react";
import type { Review } from "@/lib/data";

interface ReviewsViewProps {
  reviews: Review[];
  onOpenReview: (review: Review) => void;
}

function stars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export default function ReviewsView({ reviews, onOpenReview }: ReviewsViewProps) {
  const [filter, setFilter] = useState<"all" | "needs_review">("all");
  const needsReviewCount = reviews.filter((r) => r.status === "needs_review").length;
  const visible = filter === "all" ? reviews : reviews.filter((r) => r.status === "needs_review");

  return (
    <section className="view" aria-label="Avis">
      <div className="filter-row" role="tablist" aria-label="Filtrer les avis">
        <button
          className={`pill${filter === "all" ? " active" : ""}`}
          onClick={() => setFilter("all")}
        >
          Tous
        </button>
        <button
          className={`pill${filter === "needs_review" ? " active" : ""}`}
          onClick={() => setFilter("needs_review")}
        >
          À valider {needsReviewCount > 0 ? `(${needsReviewCount})` : ""}
        </button>
      </div>

      <div className="card">
        {visible.length === 0 ? (
          <div className="empty-state">Rien à valider pour le moment.</div>
        ) : (
          visible.map((review) => (
            <button
              key={review.id}
              id={`review-trigger-${review.id}`}
              className="review-item"
              onClick={() => onOpenReview(review)}
            >
              <div className="meta">
                <span className="stars">{stars(review.rating)}</span>
                <span className="excerpt">{review.comment}</span>
              </div>
              {review.status === "needs_review" ? (
                <span className="badge warn">À valider</span>
              ) : (
                <span className="badge good">Répondu auto</span>
              )}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
