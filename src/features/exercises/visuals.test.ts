import { expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import catalog from "../../../supabase/catalog/exercises.json";
import {
  resolveExerciseVisuals,
  specificVisualSlugs,
  movementVisualSlugs,
} from "./visuals";
it("resolves specific, movement, then generic in strict order", () => {
  expect(
    resolveExerciseVisuals({
      slug: "barbell_bench_press",
      ownerId: null,
      patternSlug: "horizontal_push",
    }).map((v) => v.kind),
  ).toEqual(["exercise", "movement", "default"]);
});
it("custom exercises use the primary movement even when a name resembles the system", () => {
  expect(
    resolveExerciseVisuals({
      slug: "barbell_bench_press",
      ownerId: "owner",
      patternSlug: "horizontal_push",
    })[0].kind,
  ).toBe("movement");
  expect(
    resolveExerciseVisuals({
      slug: "unknown",
      ownerId: null,
      patternSlug: "unknown",
    })[0].src,
  ).toBe("/ui/exercise.svg");
});
it("covers all 183 catalog entries with 8 specific and 175 movement fallbacks", () => {
  let specific = 0,
    movement = 0;
  for (const exercise of catalog.exercises) {
    const visuals = resolveExerciseVisuals({
      slug: exercise.slug,
      ownerId: null,
      patternSlug: exercise.primaryPattern,
    });
    if (visuals[0].kind === "exercise") specific++;
    if (visuals[0].kind === "movement") movement++;
    for (const visual of visuals)
      expect(existsSync(join(process.cwd(), "public", visual.src))).toBe(true);
  }
  expect([specific, movement]).toEqual([8, 175]);
  expect(specificVisualSlugs).toHaveLength(8);
  expect(movementVisualSlugs).toHaveLength(29);
});
it("ships small local SVGs without scripts or external resources", () => {
  for (const src of [
    ...specificVisualSlugs.map((s) => `exercise-thumbnails/${s}.svg`),
    ...movementVisualSlugs.map((s) => `movement-patterns/${s}.svg`),
    "ui/exercise.svg",
  ]) {
    const text = readFileSync(join(process.cwd(), "public", src), "utf8");
    expect(text.length).toBeLessThan(2500);
    expect(text).not.toMatch(/<script|<foreignObject|\shref=|\sonload=/i);
  }
});
