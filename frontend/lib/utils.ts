import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Fusionne des classes Tailwind en résolvant les conflits.
 *
 * Attendu par les composants Magic UI et shadcn, qui l'importent depuis
 * `@/lib/utils`. Sans ce fichier, chaque composant ajouté échoue à la
 * compilation.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
