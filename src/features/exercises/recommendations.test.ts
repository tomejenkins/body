import { describe, expect, it } from "vitest";
import catalog from "../../../supabase/catalog/exercises.json";
import {
  compatibleEquipment,
  filterExercises,
  recommendExercises,
} from "./recommendations";
import type { Exercise, Preference } from "./types";
const exercises: Exercise[] = catalog.exercises.map((e) => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  ownerId: null,
  exerciseType: e.exerciseType as Exercise["exerciseType"],
  instructions: e.instructions,
  archivedAt: null,
  primaryPatternId: e.primaryPattern,
  secondaryPatternIds: e.secondaryPatterns,
  primaryMuscleIds: e.primaryMuscles,
  secondaryMuscleIds: e.secondaryMuscles,
  equipmentIds: e.equipment,
}));
const find = (slug: string) => {
  const e = exercises.find((e) => e.slug === slug);
  if (!e) throw new Error("Fixture missing");
  return e;
};
const equipment = [
  "barbell",
  "dumbbell",
  "flat_bench",
  "adjustable_bench",
  "squat_rack",
];
const preference = (
  slug: string,
  value: Partial<Preference> = {},
): Preference => ({
  exerciseId: find(slug).id,
  isFavorite: false,
  preference: "neutral",
  ...value,
});
const base = { patternId: "horizontal_push", availableEquipmentIds: equipment };
describe("hard recommendation eligibility", () => {
  it("requires the exact primary or declared secondary pattern", () => {
    const result = recommendExercises(exercises, base, "none");
    expect(result.candidates).toHaveLength(5);
    expect(
      result.candidates.every(
        (r) => r.exercise.primaryPatternId === "horizontal_push",
      ),
    ).toBe(true);
    expect(result.eligibleCount).toBeGreaterThan(5);
    expect(
      recommendExercises([find("incline_dumbbell_press")], base, "none")
        .candidates,
    ).toHaveLength(1);
  });
  it("never substitutes isolation for compound or compound for isolation", () => {
    for (const exerciseType of ["compound", "isolation", "other"] as const) {
      const result = recommendExercises(
        exercises,
        {
          exerciseType,
          availableEquipmentIds: catalog.equipmentTypes.map((e) => e.slug),
        },
        "none",
      );
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(
        result.candidates.every(
          (r) => r.exercise.exerciseType === exerciseType,
        ),
      ).toBe(true);
    }
  });
  it("combines primary/secondary muscle, equipment, pattern and type filters", () => {
    const filters = {
      patternId: "horizontal_push",
      muscleId: "pectorals",
      exerciseType: "compound" as const,
      availableEquipmentIds: ["dumbbell", "flat_bench"],
    };
    const result = filterExercises(exercises, filters, [], "none");
    expect(result.map((e) => e.slug)).toContain("dumbbell_bench_press");
    expect(result.map((e) => e.slug)).not.toContain("dumbbell_chest_fly");
    expect(result.map((e) => e.slug)).not.toContain("barbell_bench_press");
    expect(
      recommendExercises(exercises, filters, "none").candidates.every((r) =>
        result.includes(r.exercise),
      ),
    ).toBe(true);
  });
  it("requires every piece of equipment, never treats alternatives as OR", () => {
    expect(
      compatibleEquipment(find("dumbbell_bench_press"), ["dumbbell"], "none"),
    ).toBe(false);
    expect(
      compatibleEquipment(
        find("dumbbell_bench_press"),
        ["dumbbell", "flat_bench"],
        "none",
      ),
    ).toBe(true);
    expect(
      compatibleEquipment(
        find("barbell_bench_press"),
        ["barbell", "flat_bench"],
        "none",
      ),
    ).toBe(false);
  });
  it("does not treat access to one machine as all machine stations", () => {
    const e = find("seated_machine_chest_press");
    expect(
      compatibleEquipment(e, ["machine_leg_extension_station"], "none"),
    ).toBe(false);
  });
  it("unknown/empty equipment permits only explicitly equipment-free exercises", () => {
    for (const availableEquipmentIds of [undefined, []]) {
      const result = recommendExercises(
        exercises,
        { availableEquipmentIds },
        "none",
      );
      expect(
        result.candidates.every((r) =>
          r.exercise.equipmentIds.every((id) => id === "none"),
        ),
      ).toBe(true);
    }
    expect(
      compatibleEquipment(
        { ...find("push_up"), equipmentIds: [] },
        undefined,
        "none",
      ),
    ).toBe(false);
  });
  it("returns a limited pool with an explanation instead of inventing exercises", () => {
    const result = recommendExercises(
      exercises,
      {
        patternId: "horizontal_adduction",
        exerciseType: "isolation",
        availableEquipmentIds: ["dumbbell", "flat_bench"],
      },
      "none",
    );
    expect(result.candidates.map((r) => r.exercise.slug)).toEqual([
      "dumbbell_chest_fly",
    ]);
    expect(result.limitedReason).toContain("Only 1");
    expect(
      recommendExercises(exercises, { patternId: "hip_hinge" }, "none")
        .limitedReason,
    ).toContain("not configured");
  });
  it("excludes archived, avoided, explicit exclusions and current workout IDs", () => {
    const a = find("dumbbell_bench_press"),
      b = find("barbell_bench_press"),
      c = find("paused_barbell_bench_press");
    const result = recommendExercises(
      [a, b, c, { ...a, id: "archived", archivedAt: "2026-01-01" }],
      {
        ...base,
        preferences: [
          preference(a.slug, { preference: "avoid", isFavorite: true }),
        ],
        excludedIds: [b.id],
        currentWorkoutIds: [c.id],
      },
      "none",
    );
    expect(result.candidates).toEqual([]);
    expect(
      recommendExercises(
        [c],
        { ...base, currentWorkoutIds: [c.id], allowWorkoutDuplicates: true },
        "none",
      ).candidates,
    ).toHaveLength(1);
  });
  it("deduplicates candidates even with duplicate inputs", () => {
    expect(
      recommendExercises([find("push_up"), find("push_up")], {}, "none")
        .candidates,
    ).toHaveLength(1);
  });
});
it("requires a primary muscle target for recommendations, not incidental assistance", () => {
  const result = recommendExercises(
    [find("dumbbell_pullover"), find("dumbbell_chest_fly")],
    {
      muscleId: "pectorals",
      exerciseType: "isolation",
      availableEquipmentIds: equipment,
      preferences: [
        preference("dumbbell_pullover", {
          isFavorite: true,
          preference: "preferred",
        }),
      ],
    },
    "none",
  );
  expect(result.candidates.map((r) => r.exercise.slug)).toEqual([
    "dumbbell_chest_fly",
  ]);
  expect(result.candidates[0].reasons).toContain(
    "Primary muscle target matched",
  );
});
describe("explainable deterministic ranking", () => {
  it("ranks preference ahead of favorites, then real recent familiarity", () => {
    const pool = [
      find("barbell_bench_press"),
      find("dumbbell_bench_press"),
      find("paused_barbell_bench_press"),
    ];
    const result = recommendExercises(
      pool,
      {
        ...base,
        preferences: [
          preference("dumbbell_bench_press", { isFavorite: true }),
          preference("paused_barbell_bench_press", { preference: "preferred" }),
        ],
        recentIds: [find("barbell_bench_press").id],
      },
      "none",
    );
    expect(result.candidates.map((r) => r.exercise.slug)).toEqual([
      "paused_barbell_bench_press",
      "dumbbell_bench_press",
      "barbell_bench_press",
    ]);
    expect(result.candidates[0].reasons).toContain("You prefer this exercise");
    expect(result.candidates[2].reasons).toContain(
      "Recently selected in your workouts",
    );
  });
  it("movement primacy outranks every soft preference on a secondary match", () => {
    const result = recommendExercises(
      [find("incline_dumbbell_press"), find("push_up")],
      {
        ...base,
        preferences: [
          preference("incline_dumbbell_press", {
            isFavorite: true,
            preference: "preferred",
          }),
        ],
      },
      "none",
    );
    expect(result.candidates[0].exercise.slug).toBe("push_up");
  });
  it("is stable for new users regardless of database input ordering", () => {
    const a = recommendExercises(exercises, base, "none"),
      b = recommendExercises([...exercises].reverse(), base, "none");
    expect(a).toEqual(b);
    expect(
      a.candidates.every((r) => !r.reasons.some((s) => s.includes("Recently"))),
    ).toBe(true);
  });
  it("allows both types when unspecified and no pattern excludes either", () => {
    const candidates = recommendExercises(
      [find("dumbbell_bench_press"), find("dumbbell_chest_fly")],
      { muscleId: "pectorals", availableEquipmentIds: equipment },
      "none",
    ).candidates;
    expect(new Set(candidates.map((r) => r.exercise.exerciseType))).toEqual(
      new Set(["compound", "isolation"]),
    );
  });
  it("supports combined search, favorite and private-custom browsing filters", () => {
    const e = { ...find("dumbbell_bench_press"), ownerId: "owner" };
    expect(
      filterExercises(
        [e],
        { query: "  BENCH ", favoritesOnly: true, customOnly: true },
        [preference(e.slug, { isFavorite: true })],
      ),
    ).toEqual([e]);
    expect(filterExercises([e], { favoritesOnly: true })).toEqual([]);
  });
});
describe("reviewed source catalog", () => {
  it("has 183 unique stable IDs/slugs and valid independent types", () => {
    expect(exercises).toHaveLength(183);
    expect(new Set(exercises.map((e) => e.id)).size).toBe(183);
    expect(new Set(exercises.map((e) => e.slug)).size).toBe(183);
    for (const e of exercises) {
      expect(["compound", "isolation", "other"]).toContain(e.exerciseType);
      expect(e.primaryPatternId).toBeTruthy();
      expect(e.primaryMuscleIds.length).toBeGreaterThan(0);
      expect(e.equipmentIds.length).toBeGreaterThan(0);
      expect(
        e.primaryMuscleIds.some((id) => e.secondaryMuscleIds.includes(id)),
      ).toBe(false);
    }
    expect(find("barbell_romanian_deadlift").exerciseType).toBe("compound");
    expect(find("machine_leg_extension").exerciseType).toBe("isolation");
    expect(find("forearm_plank").exerciseType).toBe("other");
  });
});
