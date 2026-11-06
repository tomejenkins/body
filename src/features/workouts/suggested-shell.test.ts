import { expect, it } from "vitest";
import { suggestedShell } from "./suggested-shell";
import catalog from "../../../supabase/catalog/exercises.json";
import type { Exercise } from "@/features/exercises/types";
const patterns = catalog.movementPatterns,
  muscles = catalog.muscleGroups;
const id = (slug: string) => muscles.find((m) => m.slug === slug)!.id;
const exercises: Exercise[] = catalog.exercises.map((e) => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  exerciseType: e.exerciseType as Exercise["exerciseType"],
  ownerId: null,
  archivedAt: null,
  instructions: e.instructions,
  primaryPatternId: patterns.find((p) => p.slug === e.primaryPattern)!.id,
  secondaryPatternIds: [],
  primaryMuscleIds: e.primaryMuscles.map(id),
  secondaryMuscleIds: [],
  equipmentIds: [],
}));
it("creates two complementary chest movements without choosing actual exercises or load", () => {
  const shell = suggestedShell(
    id("pectorals"),
    "",
    exercises,
    patterns,
    muscles,
  );
  expect(shell).toHaveLength(2);
  expect(new Set(shell.map((s) => s.pattern)).size).toBe(2);
  expect(shell[0].title).toBe("Flat Chest Press");
  expect(
    shell.every((s) => s.sets === 3 && s.repsMin > 0 && s.repsMax >= s.repsMin),
  ).toBe(true);
  expect(shell[0]).not.toHaveProperty("exerciseId");
  expect(shell[0]).not.toHaveProperty("weight");
});
it("creates four slots for two groups with distinct patterns available", () =>
  expect(
    suggestedShell(
      id("pectorals"),
      id("triceps"),
      exercises,
      patterns,
      muscles,
    ),
  ).toHaveLength(4));
it("rejects duplicate or unknown muscle selections", () => {
  expect(() =>
    suggestedShell(
      id("pectorals"),
      id("pectorals"),
      exercises,
      patterns,
      muscles,
    ),
  ).toThrow(/different/);
  expect(() =>
    suggestedShell("invalid", "", exercises, patterns, muscles),
  ).toThrow(/primary/);
});
it("does not fill a limited catalog with duplicate or unsupported patterns", () => {
  const limited = exercises.filter((e) => e.slug === "barbell_bench_press");
  expect(
    suggestedShell(id("pectorals"), "", limited, patterns, muscles),
  ).toHaveLength(1);
  expect(suggestedShell(id("pectorals"), "", [], patterns, muscles)).toEqual(
    [],
  );
});
it("uses isolation rep guidance independently from actual effort or loads", () => {
  const shell = suggestedShell(id("biceps"), "", exercises, patterns, muscles);
  expect(shell[0]).toMatchObject({
    exerciseType: "isolation",
    repsMin: 10,
    repsMax: 15,
  });
});
