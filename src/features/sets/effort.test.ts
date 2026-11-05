import { expect, it } from "vitest";
import { validEffort, effortSummary } from "./effort";
import { draftFor, newSetDraft, valuesFor, type LoggedSet } from "./model";
const row: LoggedSet = {
  id: "id",
  workout_exercise_id: "item",
  position: 1,
  set_type: "working",
  load_mode: "external",
  status: "completed",
  actual_reps: 5,
  actual_weight_kg: 22.68,
  entered_weight: 50,
  entered_unit: "lb",
  completed_at: "2026-01-01",
  deleted_at: null,
  revision: 1,
  last_mutation_id: null,
  effort_scale: "rpe",
  effort_value: 9.5,
  performed_to_failure: true,
};
it("keeps type, effort and failure independent with no implicit conversions", () => {
  for (const scale of ["rpe", "rir"] as const)
    for (const failure of [true, false])
      expect(
        validEffort({ scale, value: scale === "rpe" ? 10 : 0, failure }),
      ).toBe(true);
  expect(
    effortSummary({ ...row, effort_value: 10, performed_to_failure: false }),
  ).toBe("RPE 10");
  expect(
    effortSummary({
      ...row,
      effort_scale: "rir",
      effort_value: 0,
      performed_to_failure: false,
    }),
  ).toBe("RIR 0");
  expect(effortSummary({ performed_to_failure: true })).toBe("To Failure");
});
it("validates exact supported scale ranges and paired nulls", () => {
  for (const v of [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10])
    expect(validEffort({ scale: "rpe", value: v, failure: false })).toBe(true);
  for (const v of [0, 1, 2, 3, 4, 5])
    expect(validEffort({ scale: "rir", value: v, failure: false })).toBe(true);
  for (const [scale, value] of [
    ["rpe", 5],
    ["rpe", 8.1],
    ["rpe", 11],
    ["rir", -1],
    ["rir", 0.5],
    ["rir", 6],
    ["x", 9],
    ["rpe", null],
    [null, 9],
    ["rpe", NaN],
  ])
    expect(validEffort({ scale, value, failure: false })).toBe(false);
  expect(validEffort({ scale: null, value: null, failure: false })).toBe(true);
  expect(effortSummary({ effort_scale: "rir", effort_value: 5 })).toBe(
    "RIR 5+",
  );
});
it("preserves entered scale/load across units and resets new-set actual effort", () => {
  const draft = draftFor(row, "lb");
  expect(draft.weight).toBe("50");
  expect(valuesFor(draft, "lb", row).effort).toEqual({
    scale: "rpe",
    value: 9.5,
    failure: true,
  });
  expect(valuesFor(draftFor(row, "kg"), "kg", row).weight).toBe("22.68");
  const fresh = newSetDraft(draft, false);
  expect(valuesFor(fresh, "lb", row).effort).toEqual({
    scale: null,
    value: null,
    failure: false,
  });
  expect(fresh.type).toBe("working");
  expect(row.performed_to_failure).toBe(true);
});
it("legacy missing values stay unrated and warm-up failure is rejected", () => {
  expect(
    valuesFor(
      {
        ...draftFor(
          {
            ...row,
            effort_scale: null,
            effort_value: null,
            performed_to_failure: false,
          },
          "lb",
        ),
      },
      "lb",
      row,
    ).effort,
  ).toEqual({ scale: null, value: null, failure: false });
  expect(() =>
    valuesFor({ ...draftFor(row, "lb"), type: "warm_up" }, "lb", row),
  ).toThrow("Clear To Failure");
});
