import { describe, expect, it } from "vitest";
import {
  allMovementOptions,
  movementKey,
  suggestedShell,
  workoutSetupOptions,
} from "./suggested-shell";
import { quickFocus } from "./quick-focus";
import catalog from "../../../supabase/catalog/exercises.json";
import intents from "@/features/exercises/movement-intents.json";
import type { Exercise } from "@/features/exercises/types";
import { readFileSync } from "node:fs";
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
const library = { exercises, patterns, muscles };
const shell = (
  primary: string,
  secondary = "",
  emphasis = "balanced",
  pool = exercises,
) => suggestedShell(primary, secondary, pool, patterns, muscles, emphasis);
it.each([
  ["chest", 4],
  ["back", 4],
  ["legs", 4],
  ["shoulders", 4],
  ["biceps", 3],
  ["triceps", 3],
  ["core", 3],
])("%s alone creates %i useful unbound slots", (focus, count) => {
  const slots = shell(String(focus));
  expect(slots).toHaveLength(Number(count));
  expect(new Set(slots.map(movementKey)).size).toBe(slots.length);
  for (const s of slots) {
    expect(s).toMatchObject({
      sets: 3,
      repsMin: s.exerciseType === "compound" ? 8 : 10,
      repsMax: s.exerciseType === "compound" ? 12 : 15,
    });
    expect(Object.keys(s).sort()).toEqual(
      [
        "exerciseType",
        "intent",
        "muscle",
        "pattern",
        "repsMax",
        "repsMin",
        "sets",
        "title",
      ].sort(),
    );
  }
});
it.each([
  ["chest", "triceps", 3, 2],
  ["back", "biceps", 3, 2],
  ["legs", "shoulders", 3, 2],
  ["biceps", "triceps", 2, 2],
])("allocates %s + %s as %i / %i", (a, b, n, m) => {
  expect(shell(a, b)).toEqual([
    ...shell(a).slice(0, n),
    ...shell(b).slice(0, m),
  ]);
});
it("covers complementary balanced patterns without inventing IDs", () => {
  expect(shell("legs").map((s) => s.intent)).toEqual([
    "squat",
    "hinge",
    "single_leg",
    "leg_curl",
  ]);
  expect(shell("back").map((s) => s.intent)).toEqual([
    "vertical_pull",
    "row",
    "pullover",
    "upper_row",
  ]);
  expect(
    shell("biceps").every((s) => s.pattern === shell("biceps")[0].pattern),
  ).toBe(true);
  expect(shell("biceps").map((s) => s.intent)).toEqual([
    "standard_curl",
    "neutral_curl",
    "lengthened_curl",
  ]);
  expect(shell("triceps").map((s) => s.intent)).toEqual([
    "pushdown",
    "overhead_extension",
    "lying_extension",
  ]);
});
it.each([
  ["legs", "hamstrings", ["hinge", "leg_curl", "squat", "single_leg"]],
  ["legs", "quads", ["squat", "single_leg", "leg_extension", "hinge"]],
  ["legs", "glutes", ["hip_thrust", "hinge", "single_leg", "squat"]],
  ["legs", "calves", ["calf_straight", "calf_bent", "squat", "hinge"]],
  [
    "chest",
    "upper_chest",
    ["incline_press", "upper_chest_fly", "flat_press", "chest_fly"],
  ],
  ["back", "lats", ["vertical_pull", "lat_row", "row", "pullover"]],
  [
    "shoulders",
    "front_delts",
    ["front_raise", "overhead_press", "lateral_raise", "rear_delt"],
  ],
  [
    "shoulders",
    "side_delts",
    ["lateral_raise", "overhead_press", "rear_delt", "front_raise"],
  ],
  [
    "shoulders",
    "rear_delts",
    ["rear_delt", "rear_delt_pull", "overhead_press", "lateral_raise"],
  ],
])("prioritizes actual %s / %s intent", (focus, emphasis, order) => {
  expect(shell(focus, "", emphasis).map((s) => s.intent)).toEqual(order);
});
it("keeps secondary focus independent of primary emphasis", () => {
  expect(shell("legs", "shoulders", "calves").slice(-2)).toEqual(
    shell("shoulders").slice(0, 2),
  );
});
it("bounds every two-focus/emphasis combination and is deterministic", () => {
  for (const a of quickFocus)
    for (const b of quickFocus.filter((b) => b.id !== a.id))
      for (const e of ["balanced", ...a.emphasis.map((e) => e.id)]) {
        const slots = shell(a.id, b.id, e);
        expect(slots.length).toBeLessThanOrEqual(6);
        expect(slots.length).toBeGreaterThanOrEqual(4);
        expect(new Set(slots.map(movementKey)).size).toBe(slots.length);
        expect(shell(a.id, b.id, e, [...exercises].reverse())).toEqual(slots);
      }
});
it("falls back to complementary supported intent with limited catalogs", () => {
  const pool = exercises.filter((e) =>
    [
      "incline_barbell_bench_press",
      "barbell_bench_press",
      "standing_cable_chest_fly",
    ].includes(e.slug),
  );
  expect(shell("chest", "", "upper_chest", pool).map((s) => s.intent)).toEqual([
    "incline_press",
    "flat_press",
    "chest_fly",
  ]);
  expect(
    shell(
      "chest",
      "",
      "balanced",
      pool.filter((e) => e.slug === "barbell_bench_press"),
    ),
  ).toHaveLength(1);
  expect(
    shell(
      "biceps",
      "",
      "neutral_curl",
      exercises.filter((e) => e.slug === "dumbbell_hammer_curl"),
    ).map((s) => s.intent),
  ).toEqual(["neutral_curl"]);
  expect(shell("chest", "", "balanced", [])).toEqual([]);
  expect(
    shell("chest", "", "balanced", [{ ...pool[0], archivedAt: "yesterday" }]),
  ).toEqual([]);
});
it("rejects invalid and duplicate focus or unrelated emphasis", () => {
  expect(() => shell("chest", "chest")).toThrow(/different/);
  expect(() => shell("unknown")).toThrow(/primary/);
  expect(() => shell("legs", "", "upper_chest")).toThrow(/emphasis/);
});
it("emphasis changes structure and setup previews exactly match generation", () => {
  const setup = workoutSetupOptions(library);
  for (const f of setup.focuses)
    for (const e of f.emphasis) {
      expect(shell(f.id, "", e.id).map(movementKey)).not.toEqual(
        shell(f.id).map(movementKey),
      );
      expect(
        setup.counts[`${f.id}:triceps:${e.id}`] ?? shell(f.id, "", e.id).length,
      ).toBe(f.id === "triceps" ? 3 : shell(f.id, "triceps", e.id).length);
    }
  const noShrug = workoutSetupOptions({
    ...library,
    exercises: exercises.filter((e) => e.slug !== "dumbbell_shrug"),
  });
  expect(
    noShrug.focuses.find((f) => f.id === "back")!.emphasis.map((e) => e.id),
  ).not.toContain("traps");
  const limited = workoutSetupOptions({
    ...library,
    exercises: exercises.filter((e) => e.slug === "barbell_bench_press"),
  });
  expect(limited.focuses.find((f) => f.id === "chest")!.emphasis).toEqual([]);
});
it("manual editing offers broad taxonomy choices and all distinct supported intents", () => {
  const options = allMovementOptions(library);
  expect(new Set(options.map(movementKey)).size).toBe(options.length);
  expect(
    options.filter((s) => s.intent && s.muscle === id("biceps")).length,
  ).toBeGreaterThanOrEqual(3);
  expect(options.length).toBeGreaterThan(6);
});
describe("intent registry consistency", () => {
  it("only refines existing catalog classifications and every definition has coverage", () => {
    for (const d of intents) {
      expect(patterns.find((p) => p.id === d.patternId)?.slug).toBe(d.pattern);
      expect(muscles.find((m) => m.id === d.muscleId)?.slug).toBe(d.muscle);
      const members = catalog.exercises.filter((e) =>
        d.exercises.includes(e.slug),
      );
      expect(
        d.exercises.length
          ? members.length
          : catalog.exercises.filter(
              (e) =>
                e.primaryPattern === d.pattern &&
                e.primaryMuscles.includes(d.muscle) &&
                e.exerciseType === d.exerciseType,
            ).length,
      ).toBeGreaterThan(0);
      expect(members.length).toBe(d.exercises.length);
      for (const e of members) {
        expect(e.primaryPattern).toBe(d.pattern);
        expect(e.primaryMuscles).toContain(d.muscle);
        expect(e.exerciseType).toBe(d.exerciseType);
      }
    }
  });
  it("keeps the forward migration registry identical to app metadata", () => {
    const sql = readFileSync(
      "supabase/migrations/20261106163951_movement_intent_shells.sql",
      "utf8",
    );
    expect(JSON.parse(sql.split("$registry$")[1])).toEqual(intents);
  });
});

it("Full Body spans five distinct curated categories and ignores no stale muscle state", () => {
  const slots = shell("full_body");
  expect(slots.map((s) => s.intent)).toEqual([
    "squat",
    "hinge",
    "flat_press",
    "row",
    "crunch",
  ]);
  expect(new Set(slots.map(movementKey)).size).toBe(5);
  expect(() => shell("full_body", "chest")).toThrow(/without/);
  expect(() => shell("full_body", "", "upper_chest")).toThrow(/without/);
  const noSquat = exercises.filter(
    (e) => e.primaryPatternId !== patterns.find((p) => p.slug === "squat")!.id,
  );
  expect(shell("full_body", "", "balanced", noSquat)[0].intent).toBe(
    "single_leg",
  );
  expect(shell("full_body", "", "balanced", [])).toEqual([]);
  expect(workoutSetupOptions(library).counts["full_body::balanced"]).toBe(5);
});
