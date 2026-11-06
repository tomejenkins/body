import { expect, it } from "vitest";
import catalog from "../../../supabase/catalog/exercises.json";
import type { Exercise } from "@/features/exercises/types";
import {
  exerciseMatch,
  rankMovementExercises,
  matchLabels,
  type MovementTarget,
} from "./selection";
const id = (
  key: "movementPatterns" | "muscleGroups" | "equipmentTypes",
  slug: string,
) => catalog[key].find((t) => t.slug === slug)!.id;
const exercises: Exercise[] = catalog.exercises.map((e) => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  ownerId: null,
  exerciseType: e.exerciseType as Exercise["exerciseType"],
  instructions: e.instructions,
  archivedAt: null,
  primaryPatternId: id("movementPatterns", e.primaryPattern),
  secondaryPatternIds: e.secondaryPatterns.map((s) =>
    id("movementPatterns", s),
  ),
  primaryMuscleIds: e.primaryMuscles.map((s) => id("muscleGroups", s)),
  secondaryMuscleIds: e.secondaryMuscles.map((s) => id("muscleGroups", s)),
  equipmentIds: e.equipment.map((s) => id("equipmentTypes", s)),
}));
const ex = (slug: string) => exercises.find((e) => e.slug === slug)!;
const target: MovementTarget = {
  patternId: id("movementPatterns", "horizontal_push"),
  muscleId: id("muscleGroups", "pectorals"),
  exerciseType: "compound",
  referenceEquipmentIds: ex("barbell_bench_press").equipmentIds,
};
it("distinguishes flat press mechanics, equipment changes, incline and fly without equivalence claims", () => {
  expect(exerciseMatch(ex("paused_barbell_bench_press"), target)).toBe(4);
  expect(exerciseMatch(ex("dumbbell_bench_press"), target)).toBe(3);
  expect(exerciseMatch(ex("seated_machine_chest_press"), target)).toBe(3);
  expect(exerciseMatch(ex("incline_dumbbell_press"), target)).toBe(2);
  expect(exerciseMatch(ex("standing_cable_chest_fly"), target)).toBe(1);
  expect(
    exerciseMatch(
      { ...ex("barbell_bench_press"), exerciseType: "isolation" },
      target,
    ),
  ).toBe(2);
  expect(exerciseMatch(ex("seated_leg_curl"), target)).toBeNull();
  expect(Object.values(matchLabels)).toEqual([
    "Same Muscle",
    "Similar",
    "Close",
    "",
  ]);
});
it("keeps pick then last choice regardless of match, deduplicates and computes pick quality independently", () => {
  const pick = ex("incline_dumbbell_press"),
    last = ex("standing_cable_chest_fly");
  const result = rankMovementExercises([...exercises, pick], {
    target,
    programPickId: pick.id,
    lastChoiceId: last.id,
    limit: 30,
  });
  expect(result[0]).toMatchObject({
    exercise: pick,
    level: 2,
    labels: ["Program Pick"],
  });
  expect(result[1]).toMatchObject({
    exercise: last,
    level: 1,
    labels: ["Last Used"],
  });
  expect(new Set(result.map((c) => c.exercise.id)).size).toBe(result.length);
  const same = rankMovementExercises(exercises, {
    target,
    programPickId: pick.id,
    lastChoiceId: pick.id,
  });
  expect(same[0].labels).toEqual(["Program Pick", "Last Used"]);
});
it("is deterministic, retains all four levels and filters additional equipment without guessing availability", () => {
  const input = {
    target,
    programPickId: ex("barbell_bench_press").id,
    lastChoiceId: null,
    limit: 30,
  };
  const a = rankMovementExercises(exercises, input),
    b = rankMovementExercises([...exercises].reverse(), input);
  expect(a.map((c) => c.exercise.id)).toEqual(b.map((c) => c.exercise.id));
  expect(new Set(a.map((c) => c.level))).toEqual(new Set([1, 2, 3, 4]));
  expect(
    new Set(
      rankMovementExercises(exercises, { ...input, limit: 12 }).map(
        (c) => c.level,
      ),
    ),
  ).toEqual(new Set([1, 2, 3, 4]));
  expect(a.every((c) => c.equipmentAvailable === null)).toBe(true);
  const restricted = rankMovementExercises(exercises, {
    ...input,
    availableEquipmentIds: [
      id("equipmentTypes", "dumbbell"),
      id("equipmentTypes", "flat_bench"),
      id("equipmentTypes", "adjustable_bench"),
    ],
  });
  expect(restricted[0].labels).toEqual(["Program Pick"]);
  expect(restricted[0].equipmentAvailable).toBe(false);
  expect(restricted.slice(1).every((c) => c.equipmentAvailable === true)).toBe(
    true,
  );
});

it("retains the current exercise with its independently calculated grade in sorted alternatives", () => {
  const selected = ex("seated_machine_chest_press");
  const result = rankMovementExercises(exercises, {
    target,
    programPickId: ex("barbell_bench_press").id,
    lastChoiceId: null,
    selectedId: selected.id,
    limit: 6,
  });
  expect(result.find((c) => c.exercise.id === selected.id)?.level).toBe(3);
  const levels = result.slice(1).map((c) => c.level!);
  expect(levels).toEqual([...levels].sort((a, b) => b - a));
  expect(result[0].labels).toContain("Program Pick");
});
