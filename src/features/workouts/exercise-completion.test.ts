import { expect, it } from "vitest";
import { exerciseSetsConfirmed } from "./exercise-completion";
const saved = {
  row: {
    status: "completed" as const,
    inputs_confirmed: true,
    deleted_at: null,
  },
  dirty: false,
  pending: 0,
};
it("requires actual confirmed completion of every visible set, independent of training metrics", () => {
  expect(exerciseSetsConfirmed([])).toBe(false);
  expect(exerciseSetsConfirmed([saved, saved])).toBe(true);
  expect(
    exerciseSetsConfirmed([
      { ...saved, row: { ...saved.row, status: "pending" } },
    ]),
  ).toBe(false);
  expect(
    exerciseSetsConfirmed([
      { ...saved, row: { ...saved.row, status: "skipped" } },
    ]),
  ).toBe(false);
  expect(
    exerciseSetsConfirmed([
      { ...saved, row: { ...saved.row, inputs_confirmed: false } },
    ]),
  ).toBe(false);
  expect(
    exerciseSetsConfirmed([
      { ...saved, row: { ...saved.row, inputs_confirmed: undefined } },
    ]),
  ).toBe(false);
});
it("cannot infer readiness from optimistic checkboxes or unresolved writes/drafts", () => {
  for (const patch of [
    { dirty: true },
    { pending: 1 },
    { error: "Not saved" },
    { localOnly: true },
    { deleting: true },
    { conflict: { status: "pending" } },
  ])
    expect(exerciseSetsConfirmed([{ ...saved, ...patch }])).toBe(false);
});
it("ignores removed rows but never treats an empty exercise as done", () => {
  const removed = {
    ...saved,
    row: {
      ...saved.row,
      deleted_at: "2026-11-10T12:00:00Z",
      status: "pending" as const,
    },
  };
  expect(exerciseSetsConfirmed([saved, removed])).toBe(true);
  expect(exerciseSetsConfirmed([removed])).toBe(false);
});
