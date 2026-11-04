import { expect, it } from "vitest";
import {
  displayWeight,
  newSetDraft,
  compareSets,
  weightToKg,
  draftFor,
  valuesFor,
  summarizeSets,
  type LoggedSet,
} from "./model";
const row: LoggedSet = {
  id: "id",
  workout_exercise_id: "item",
  position: 1,
  set_type: "working",
  load_mode: "external",
  status: "pending",
  actual_reps: 8,
  actual_weight_kg: 84.137,
  completed_at: null,
  revision: 0,
  last_mutation_id: null,
  deleted_at: null,
};
it("converts exact pounds and kilograms without accumulated round-trip drift", () => {
  expect(weightToKg("135", "lb")).toBe("61.235");
  expect(displayWeight(100, "lb")).toBe("220.46");
  for (const value of [0, 0.001, 1.234, 84.137, 100, 99999.999]) {
    const canonical = { ...row, actual_weight_kg: value };
    expect(valuesFor(draftFor(canonical, "lb"), "lb", canonical).weight).toBe(
      String(value),
    );
  }
  expect(weightToKg("", "kg")).toBeNull();
  expect(weightToKg("0", "kg")).toBe("0");
});
it("does not reconvert unchanged displayed loads when editing reps", () => {
  const draft = draftFor(row, "lb");
  draft.reps = "10";
  expect(valuesFor(draft, "lb", row).weight).toBe("84.137");
});
it("keeps blank pending data distinct from explicit zero and bodyweight load null", () => {
  const draft = {
    ...draftFor(row, "kg"),
    weight: "",
    weightDirty: true,
    reps: "",
  };
  expect(valuesFor(draft, "kg", row)).toMatchObject({
    weight: null,
    reps: null,
    completed: false,
  });
  expect(() => valuesFor({ ...draft, completed: true }, "kg", row)).toThrow();
  expect(
    valuesFor(
      { ...draft, mode: "bodyweight", reps: "0", completed: true },
      "kg",
      row,
    ),
  ).toMatchObject({ weight: null, reps: 0, completed: true });
});
it("validates decimal, integer and bounded performance inputs", () => {
  for (const weight of ["NaN", "Infinity", "-1", "1e3", "100001", "0.1234567"])
    expect(() => weightToKg(weight, "kg")).toThrow();
  for (const reps of ["-1", "1.5", "1001"]) {
    expect(() =>
      valuesFor({ ...draftFor(row, "kg"), reps }, "kg", row),
    ).toThrow();
  }
});
it("preserves canonical types and restores pending completion explicitly", () => {
  const draft = draftFor(
    { ...row, set_type: "warm_up", status: "completed" },
    "kg",
  );
  expect(draft.type).toBe("warm_up");
  expect(valuesFor({ ...draft, completed: false }, "kg", row).completed).toBe(
    false,
  );
});
it("distinguishes none, partial and full without completing pending or missing sets", () => {
  const done = { ...row, status: "completed" as const };
  expect(summarizeSets([{ sets: [] }]).completion).toBe("none");
  expect(summarizeSets([{ sets: [done, row] }])).toMatchObject({
    completed: 1,
    pending: 1,
    completion: "partial",
  });
  expect(summarizeSets([{ sets: [done] }, { sets: [] }]).completion).toBe(
    "partial",
  );
  expect(summarizeSets([{ sets: [done], prescribedSets: 3 }]).completion).toBe(
    "partial",
  );
  expect(summarizeSets([{ sets: [done] }]).completion).toBe("full");
  expect(
    summarizeSets([{ sets: [done, { ...row, deleted_at: "date" }] }]).pending,
  ).toBe(0);
});

it("copies current draft values into a pending normal set without mutating the preceding set", () => {
  const previous = {
    ...draftFor(row, "kg"),
    weight: "150",
    reps: "6",
    type: "warm_up" as const,
    completed: true,
    weightDirty: true,
  };
  expect(newSetDraft(previous, false)).toMatchObject({
    weight: "150",
    reps: "6",
    type: "working",
    completed: false,
    weightDirty: true,
  });
  expect(previous.completed).toBe(true);
  expect(newSetDraft(undefined, true)).toMatchObject({
    weight: "",
    reps: "",
    mode: "bodyweight",
    completed: false,
  });
});
it("orders sets by persisted position rather than identity or creation order", () => {
  const rows = [
    { ...row, id: "later", position: 8 },
    { ...row, id: "first", position: 2 },
  ];
  expect([...rows].sort(compareSets).map((r) => r.id)).toEqual([
    "first",
    "later",
  ]);
  expect(rows[0].id).toBe("later");
});

it("preserves exact practical pounds and original fractional precision across reloads", () => {
  for (const value of ["50", "135", "52.5", "52.125", "0.001234"]) {
    const kg = weightToKg(value, "lb");
    const saved = {
      ...row,
      actual_weight_kg: Number(kg),
      entered_weight: Number(value),
      entered_unit: "lb" as const,
    };
    for (let i = 0; i < 20; i++) {
      expect(draftFor(saved, "lb").weight).toBe(value);
      expect(valuesFor(draftFor(saved, "kg"), "kg", saved).weight).toBe(kg);
    }
  }
  expect(displayWeight(Number(weightToKg("50", "lb")), "lb")).toBe("50");
  expect(displayWeight(50, "kg")).toBe("50");
  expect(displayWeight(50.123, "kg")).toBe("50.123");
});
it("loads suggestions without actual performance and stops fallback after confirmation", () => {
  const suggested = {
    ...row,
    inputs_confirmed: false,
    is_automatic: true,
    actual_reps: null,
    actual_weight_kg: null,
    prescribed_reps_min: 8,
    prescribed_weight_kg: 50,
  };
  const draft = draftFor(suggested, "kg");
  expect(draft).toMatchObject({ weight: "50", reps: "8", completed: false });
  expect(valuesFor(draft, "kg", suggested)).toMatchObject({
    weight: "50",
    reps: 8,
    completed: false,
  });
  expect(
    draftFor({ ...suggested, inputs_confirmed: true }, "kg"),
  ).toMatchObject({ weight: "", reps: "" });
});
