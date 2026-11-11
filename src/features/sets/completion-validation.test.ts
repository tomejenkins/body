import { expect, it } from "vitest";
import {
  draftFor,
  setFieldErrors,
  valuesFor,
  SetValidationError,
  type LoggedSet,
  type SetDraft,
} from "./model";
const row: LoggedSet = {
  id: "id",
  workout_exercise_id: "item",
  position: 1,
  set_type: "working",
  load_mode: "external",
  status: "pending",
  actual_reps: null,
  actual_weight_kg: null,
  completed_at: null,
  revision: 0,
  last_mutation_id: null,
  deleted_at: null,
};
const draft: SetDraft = {
  ...draftFor(row, "lb"),
  weight: "135",
  reps: "8",
  completed: true,
  weightDirty: true,
};
it.each([
  "",
  " ",
  "0",
  "-1",
  "word",
  "NaN",
  "Infinity",
  "1e2",
  "100001",
  "0.1234567",
])(
  "rejects invalid completed weight %j without altering the draft",
  (weight) => {
    const current = { ...draft, weight },
      before = { ...current };
    expect(setFieldErrors(current, "kg", row).weight).toBeTruthy();
    expect(() => valuesFor(current, "kg", row)).toThrow(SetValidationError);
    expect(current).toEqual(before);
  },
);
it.each(["", " ", "0", "-1", "word", "1.5", "1001", "Infinity", "1e2"])(
  "rejects invalid completed reps %j",
  (reps) => {
    expect(setFieldErrors({ ...draft, reps }, "lb", row).reps).toBeTruthy();
  },
);
it("distinguishes missing/zero messages and clears only corrected fields", () => {
  expect(setFieldErrors({ ...draft, weight: "", reps: "" }, "lb", row)).toEqual(
    { weight: "Enter weight", reps: "Enter reps" },
  );
  expect(
    setFieldErrors({ ...draft, weight: "0", reps: "0" }, "lb", row),
  ).toEqual({
    weight: "Weight must be greater than zero",
    reps: "Reps must be greater than zero",
  });
  expect(setFieldErrors({ ...draft, reps: "" }, "lb", row)).toEqual({
    reps: "Enter reps",
  });
  expect(setFieldErrors(draft, "lb", row)).toEqual({});
});
it("respects exact units, canonical bounds and representable positive load", () => {
  expect(valuesFor(draft, "lb", row).weight).toBe("61.235");
  expect(setFieldErrors({ ...draft, weight: "220462" }, "lb", row)).toEqual({});
  expect(
    setFieldErrors({ ...draft, weight: "220463" }, "lb", row).weight,
  ).toBeTruthy();
  expect(
    setFieldErrors({ ...draft, weight: "0.000001" }, "lb", row).weight,
  ).toBeTruthy();
});
it("accepts bodyweight reps without inventing added load and validates deliberate resistance", () => {
  expect(
    valuesFor({ ...draft, mode: "bodyweight", weight: "" }, "lb", row),
  ).toMatchObject({ reps: 8, weight: null, completed: true });
  expect(
    setFieldErrors({ ...draft, mode: "bodyweight", reps: "0" }, "lb", row).reps,
  ).toBeTruthy();
  expect(valuesFor({ ...draft, weight: "25" }, "lb", row).weight).toBe("11.34");
});
it("preserves pending nullable/zero data and existing warm-up numeric limits", () => {
  expect(
    valuesFor({ ...draft, completed: false, weight: "", reps: "" }, "kg", row),
  ).toMatchObject({ completed: false, weight: null, reps: null });
  expect(
    valuesFor(
      { ...draft, completed: false, weight: "0", reps: "0" },
      "kg",
      row,
    ),
  ).toMatchObject({ completed: false, weight: "0", reps: 0 });
  expect(
    valuesFor({ ...draft, type: "warm_up", weight: "0", reps: "0" }, "kg", row),
  ).toMatchObject({ type: "warm_up", completed: true, weight: "0", reps: 0 });
  for (const type of ["drop", "rest_pause"] as const)
    expect(
      setFieldErrors({ ...draft, type, weight: "0" }, "kg", row).weight,
    ).toBeTruthy();
});
it("retains completed saved evidence and exact unit metadata on an invalid correction", () => {
  const saved = {
    ...row,
    status: "completed" as const,
    actual_reps: 8,
    actual_weight_kg: 61.235,
    entered_weight: 135,
    entered_unit: "lb" as const,
    revision: 4,
  };
  const current = { ...draftFor(saved, "lb"), weight: "", weightDirty: true };
  expect(() => valuesFor(current, "lb", saved)).toThrow(SetValidationError);
  expect(saved).toMatchObject({
    actual_reps: 8,
    actual_weight_kg: 61.235,
    revision: 4,
  });
});
