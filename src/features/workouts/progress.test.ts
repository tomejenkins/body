import { expect, it } from "vitest";
import { movementProgress, workoutProgress } from "./progress";
import type { WorkoutItem, Workout } from "./types";
import type { LoggedSet } from "@/features/sets/model";
const set = (overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  id: "set",
  workout_exercise_id: "item",
  position: 1,
  set_type: "working",
  load_mode: "external",
  status: "completed",
  actual_reps: 8,
  actual_weight_kg: 50,
  completed_at: "2026-11-05T12:00:00Z",
  revision: 1,
  last_mutation_id: null,
  deleted_at: null,
  inputs_confirmed: true,
  ...overrides,
});
const item = (
  sets: LoggedSet[],
  extra: Partial<WorkoutItem> = {},
): WorkoutItem => ({
  id: "item",
  exerciseId: "exercise",
  name: "Bench",
  position: 1,
  visual: { slug: "barbell_bench_press", ownerId: null },
  canRemove: false,
  bodyweightEligible: false,
  exerciseType: "compound",
  sets,
  ...extra,
});
it("opening or suggesting rows does not start a movement", () => {
  expect(movementProgress([], 3).status).toBe("Not Started");
  expect(
    movementProgress(
      [item([set({ status: "pending", inputs_confirmed: false })])],
      3,
    ).status,
  ).toBe("Not Started");
});
it("saved qualifying working sets determine partial and required completion", () => {
  expect(movementProgress([item([set()])], 3)).toEqual({
    status: "In Progress",
    completed: 1,
    required: 3,
  });
  expect(
    movementProgress(
      [item([set(), set({ id: "two" }), set({ id: "three" })])],
      3,
    ).status,
  ).toBe("Complete");
});
it("counts saved drop/rest-pause and bodyweight without inventing load", () => {
  expect(
    movementProgress(
      [
        item([
          set({ set_type: "drop" }),
          set({
            id: "two",
            set_type: "rest_pause",
            load_mode: "bodyweight",
            actual_weight_kg: null,
          }),
        ]),
      ],
      2,
    ).status,
  ).toBe("Complete");
});
it("excludes warmups, removed, unsupported, zero-rep and unconfirmed sets", () => {
  const rows = [
    set({ set_type: "warm_up" }),
    set({ deleted_at: "2026-11-05" }),
    set({ logging_kind: "assisted" }),
    set({ logging_kind: "duration" }),
    set({ actual_reps: 0 }),
    set({ inputs_confirmed: false }),
    set({ actual_weight_kg: null }),
  ];
  expect(movementProgress([item(rows)], 1).status).toBe("Not Started");
  expect(
    movementProgress([item([set()], { loggingKind: "duration" })], 1).status,
  ).toBe("Not Started");
});
it("preserves progress across continuation identities, without changing exercises", () => {
  const entries = [
    item([set()], { programMovementId: "movement" }),
    item([set({ id: "two" })], {
      id: "replacement",
      exerciseId: "different",
      programMovementId: "movement",
    }),
  ];
  expect(movementProgress(entries, 2).status).toBe("Complete");
  expect(entries[0].exerciseId).toBe("exercise");
});
it("unprescribed ad-hoc completion requires persisted explicit state", () => {
  expect(movementProgress([item([set()])]).status).toBe("In Progress");
  expect(movementProgress([item([set()], { status: "skipped" })]).status).toBe(
    "In Progress",
  );
  expect(
    movementProgress([item([set()], { status: "completed" })]).status,
  ).toBe("Complete");
  expect(movementProgress([item([], { status: "completed" })]).status).toBe(
    "Not Started",
  );
});
it("groups ordered programme movements once and includes ad-hoc additions", () => {
  const workout = {
    items: [
      item([set()], { programMovementId: "m" }),
      item([], { id: "extra" }),
    ],
    movements: [
      { id: "m", workingSets: 2 },
      { id: "empty", workingSets: 3 },
    ],
  } as unknown as Workout;
  expect(
    workoutProgress(workout).map((g) => [g.id, g.progress.status]),
  ).toEqual([
    ["m", "In Progress"],
    ["empty", "Not Started"],
    ["extra", "Not Started"],
  ]);
});
it("does not complete prescribed movement work from zero external load, while real bodyweight remains valid", () => {
  expect(
    movementProgress([item([set({ actual_weight_kg: 0 })])], 1).status,
  ).toBe("Not Started");
  expect(
    movementProgress(
      [item([set({ load_mode: "bodyweight", actual_weight_kg: null })])],
      1,
    ).status,
  ).toBe("Complete");
});
