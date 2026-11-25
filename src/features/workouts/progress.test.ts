import { expect, it } from "vitest";
import {
  movementProgress,
  workoutProgress,
  unfinishedMovementCount,
} from "./progress";
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
it("treats deleted outstanding sets as no longer required once remaining sets are complete", () => {
  expect(
    movementProgress(
      [
        item([
          set(),
          set({ id: "two" }),
          set({
            id: "three",
            status: "pending",
            inputs_confirmed: false,
            actual_reps: null,
            actual_weight_kg: null,
            completed_at: null,
            deleted_at: "2026-11-05T12:00:00Z",
          }),
        ]),
      ],
      3,
    ),
  ).toEqual({
    status: "Complete",
    completed: 2,
    required: 2,
  });
});
it("keeps movement incomplete while any visible set remains pending", () => {
  expect(
    movementProgress(
      [
        item([
          set(),
          set({ id: "two" }),
          set({
            id: "three",
            status: "pending",
            inputs_confirmed: false,
            actual_reps: null,
            actual_weight_kg: null,
            completed_at: null,
          }),
        ]),
      ],
      2,
    ).status,
  ).toBe("In Progress");
});
it("does not complete when every set is deleted", () => {
  expect(
    movementProgress(
      [
        item([
          set({ deleted_at: "2026-11-05T12:00:00Z" }),
          set({
            id: "two",
            status: "pending",
            inputs_confirmed: false,
            actual_reps: null,
            actual_weight_kg: null,
            completed_at: null,
            deleted_at: "2026-11-05T12:00:01Z",
          }),
        ]),
      ],
      2,
    ).status,
  ).toBe("Not Started");
});
it("recomputes completion after deleting a completed set and adding replacements", () => {
  const afterDelete = movementProgress(
    [item([set(), set({ id: "two", deleted_at: "2026-11-05T12:00:00Z" })])],
    2,
  );
  expect(afterDelete).toEqual({
    status: "Complete",
    completed: 1,
    required: 1,
  });

  const replacementPending = movementProgress(
    [
      item([
        set(),
        set({ id: "two", deleted_at: "2026-11-05T12:00:00Z" }),
        set({
          id: "three",
          status: "pending",
          inputs_confirmed: false,
          actual_reps: null,
          actual_weight_kg: null,
          completed_at: null,
        }),
      ]),
    ],
    2,
  );
  expect(replacementPending.status).toBe("In Progress");

  const replacementCompleted = movementProgress(
    [
      item([
        set(),
        set({ id: "two", deleted_at: "2026-11-05T12:00:00Z" }),
        set({ id: "three" }),
      ]),
    ],
    2,
  );
  expect(replacementCompleted).toEqual({
    status: "Complete",
    completed: 2,
    required: 2,
  });
});
it("does not excuse missing prescribed sets merely because another was deleted", () => {
  expect(
    movementProgress(
      [item([set(), set({ id: "deleted", deleted_at: "2026-11-05T12:00:00Z" })])],
      3,
    ),
  ).toEqual({ status: "In Progress", completed: 1, required: 2 });
});
it("does not reduce required working sets when a warm-up is deleted", () => {
  expect(
    movementProgress(
      [
        item([
          set(),
          set({
            id: "warm",
            set_type: "warm_up",
            deleted_at: "2026-11-05T12:00:00Z",
          }),
        ]),
      ],
      2,
    ),
  ).toEqual({ status: "In Progress", completed: 1, required: 2 });
});
it("adjusts working-set targets after multiple deletions but not for pending replacements", () => {
  const initial = [
    set(),
    set({ id: "two" }),
    set({ id: "three", deleted_at: "2026-11-05T12:00:00Z" }),
    set({ id: "four", deleted_at: "2026-11-05T12:00:00Z" }),
  ];
  expect(movementProgress([item(initial)], 4)).toEqual({
    status: "Complete",
    completed: 2,
    required: 2,
  });
  expect(
    movementProgress(
      [
        item([
          ...initial,
          set({
            id: "replacement",
            status: "pending",
            inputs_confirmed: false,
            actual_reps: null,
            actual_weight_kg: null,
            completed_at: null,
          }),
        ]),
      ],
      4,
    ).status,
  ).toBe("In Progress");
});
it("uses the same status for home and finish acknowledgement after reload", () => {
  const modified = item(
    [set(), set({ id: "removed", deleted_at: "2026-11-05T12:00:00Z" })],
    { prescribedSets: 2 },
  );
  const pending = item(
    [
      set({
        id: "pending",
        status: "pending",
        inputs_confirmed: false,
        actual_reps: null,
        actual_weight_kg: null,
        completed_at: null,
      }),
    ],
    { id: "other", prescribedSets: 1 },
  );
  const workout = { items: [modified], movements: [] } as unknown as Workout;
  expect(workoutProgress(workout)[0].progress.status).toBe("Complete");
  expect(unfinishedMovementCount(workoutProgress(workout))).toBe(0);
  // Recreated, server-like objects after navigation produce the same result.
  const reloaded = {
    ...workout,
    items: workout.items.map((i) => ({
      ...i,
      sets: i.sets.map((s) => ({ ...s })),
    })),
  };
  expect(unfinishedMovementCount(workoutProgress(reloaded))).toBe(0);
  expect(
    unfinishedMovementCount(
      workoutProgress({ ...reloaded, items: [...reloaded.items, pending] }),
    ),
  ).toBe(1);
});
it("keeps all-deleted movements unfinished at workout close", () => {
  const workout = {
    items: [
      item([set({ deleted_at: "2026-11-05T12:00:00Z" })], {
        prescribedSets: 1,
      }),
    ],
    movements: [],
  } as unknown as Workout;
  expect(workoutProgress(workout)[0].progress.status).toBe("Not Started");
  expect(unfinishedMovementCount(workoutProgress(workout))).toBe(1);
});
it("preserves original program targets while checking modified execution", () => {
  const workout = {
    items: [
      item(
        [set(), set({ id: "deleted", deleted_at: "2026-11-05T12:00:00Z" })],
        { programMovementId: "m" },
      ),
    ],
    movements: [{ id: "m", workingSets: 2 }],
  } as unknown as Workout;
  const progress = workoutProgress(workout);
  expect(workout.movements?.[0].workingSets).toBe(2);
  expect(progress[0].progress).toEqual({
    status: "Complete",
    completed: 1,
    required: 1,
  });
  expect(unfinishedMovementCount(progress)).toBe(0);
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
