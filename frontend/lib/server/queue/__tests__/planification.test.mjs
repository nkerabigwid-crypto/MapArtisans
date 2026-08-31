/**
 * Fenêtre d'envoi du rapport hebdomadaire.
 *
 * Ces tests portent sur une décision qui se juge en heure LOCALE suisse, alors
 * que le serveur tourne en UTC. Un décalage d'une heure envoie le SMS à 7 h du
 * matin ; un décalage de jour l'envoie un samedi.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  fenetreRapportHebdo,
  momentLocal,
  HEURE_MIN,
  HEURE_MAX,
} from "../planification.ts";

describe("Heure locale suisse", () => {
  test("convertit depuis UTC en hiver (CET, +1)", () => {
    // Mercredi 14 janvier 2026, 07:30 UTC → 08:30 à Zurich.
    const m = momentLocal(new Date("2026-01-14T07:30:00Z"));
    assert.equal(m.jour, 3, "mercredi");
    assert.equal(m.heure, 8);
  });

  test("convertit depuis UTC en été (CEST, +2)", () => {
    // Même heure UTC, mais en juillet : 09:30 à Zurich, pas 08:30.
    const m = momentLocal(new Date("2026-07-15T07:30:00Z"));
    assert.equal(m.jour, 3, "mercredi");
    assert.equal(m.heure, 9);
  });
});

describe("Fenêtre d'envoi", () => {
  test("un mercredi matin ouvre la fenêtre", () => {
    assert.equal(fenetreRapportHebdo(new Date("2026-01-14T08:00:00Z")), true);
  });

  test("refuse avant l'heure d'ouverture", () => {
    // 06:30 UTC = 07:30 à Zurich : trop tôt pour un SMS professionnel.
    assert.equal(fenetreRapportHebdo(new Date("2026-01-14T06:30:00Z")), false);
  });

  test("refuse après l'heure de fermeture", () => {
    // 10:30 UTC = 11:30 à Zurich.
    assert.equal(fenetreRapportHebdo(new Date("2026-01-14T10:30:00Z")), false);
  });

  test("refuse le samedi et le dimanche", () => {
    // Un artisan ne veut pas de SMS professionnel le week-end, et un rapport
    // lu le lundi n'a rien perdu de sa valeur.
    for (const jour of ["2026-01-17", "2026-01-18"]) {
      assert.equal(
        fenetreRapportHebdo(new Date(`${jour}T08:00:00Z`)),
        false,
        `${jour} devrait être exclu`,
      );
    }
  });

  test("accepte tous les jours ouvrés, pas seulement le lundi", () => {
    // La déduplication par semaine ISO fait que seul le premier passage de la
    // semaine produit des jobs. La fenêtre large ne multiplie donc pas les
    // envois : elle évite qu'une panne du lundi matin fasse sauter la semaine.
    for (const jour of ["2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16"]) {
      assert.equal(
        fenetreRapportHebdo(new Date(`${jour}T08:00:00Z`)),
        true,
        `${jour} devrait être accepté`,
      );
    }
  });

  test("les bornes sont incluses", () => {
    assert.ok(HEURE_MIN < HEURE_MAX, "la fenêtre doit couvrir plus d'une heure");
    // Une fenêtre d'une seule heure serait ratée à chaque redémarrage tombant
    // au mauvais moment, le balayage n'ayant lieu que toutes les 5 minutes.
  });
});
