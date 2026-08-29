"use client";

import { useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import type { Review } from "@/lib/data";

interface ReviewModalProps {
  /** null quand aucune feuille n'est ouverte — le composant reste monté pour l'animation de sortie. */
  review: Review | null;
  onClose: () => void;
  onPublish: (reviewId: string, text: string) => void;
}

/**
 * Feuille de réponse à un avis.
 *
 * Bâtie sur Drawer de Base UI, qui apporte ce que la version maison n'avait pas :
 * piège à focus, fermeture par Échap, verrou de scroll, et fermeture au
 * glissement vers le bas — le geste attendu d'une feuille bas-d'écran sur mobile.
 *
 * VirtualKeyboardProvider garde le champ visible quand le clavier logiciel
 * s'ouvre : sans lui, le clavier recouvre le textarea sur un téléphone.
 */
export default function ReviewModal({ review, onClose, onPublish }: ReviewModalProps) {
  // `review` repasse à null dès la fermeture, mais la feuille doit rester
  // lisible le temps de glisser hors de l'écran : on conserve donc le dernier
  // avis affiché. Ajuster un état pendant le rendu est le motif React prévu
  // pour ce cas — pas besoin d'effet.
  const [shown, setShown] = useState(review);
  const [draft, setDraft] = useState(review?.ai_reply_draft ?? "");

  if (review && review.id !== shown?.id) {
    setShown(review);
    setDraft(review.ai_reply_draft);
  }

  // Avant la toute première ouverture il n'y a rien à afficher ni à animer.
  // Sortir ici évite surtout de passer `triggerId={null}` : Base UI lit un id
  // nul comme « non contrôlé », et basculer ensuite vers une chaîne déclenche
  // l'avertissement React sur le passage non-contrôlé → contrôlé.
  if (!shown) return null;

  return (
    <Drawer.Root
      open={review !== null}
      // Le drawer est piloté depuis le parent, donc Base UI ignore quel élément
      // l'a ouvert : sans cet id, le focus retombe sur <body> à la fermeture et
      // un utilisateur au clavier perd sa place dans la liste.
      triggerId={`review-trigger-${shown.id}`}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="sheet-backdrop" />
          <Drawer.Viewport className="sheet-viewport">
            <Drawer.Popup className="sheet-popup">
              {/* Barre de préhension : signale que la feuille se tire vers le bas. */}
              <span className="sheet-grip" aria-hidden="true" />
              <Drawer.Content className="sheet-content">
                <div>
                  <div className="modal-stars">
                    {"★".repeat(shown.rating)}
                    {"☆".repeat(5 - shown.rating)}
                  </div>
                  <Drawer.Title className="modal-title">{shown.reviewer_name}</Drawer.Title>
                </div>
                <div className="modal-comment">{shown.comment}</div>
                <div>
                  <label className="modal-draft-label" htmlFor="reply-draft">
                    Brouillon généré par l&apos;IA
                  </label>
                  <textarea
                    id="reply-draft"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                </div>
                <div className="modal-actions">
                  <Drawer.Close className="btn secondary">Annuler</Drawer.Close>
                  <button className="btn" onClick={() => onPublish(shown.id, draft)}>
                    Publier
                  </button>
                </div>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}
