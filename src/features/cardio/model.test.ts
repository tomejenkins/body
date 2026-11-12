import { expect, it } from "vitest";
import {
  activities,
  cardioTotals,
  durationSeconds,
  validCardio,
  type CardioCommand,
} from "./model";
const id = "12345678-1234-1234-1234-123456789012";
it("validates manual duration without inventing reps, loads or fractional seconds", () => {
  expect(durationSeconds("20")).toBe(1200);
  expect(durationSeconds("20.5")).toBe(1230);
  expect(durationSeconds("1440")).toBe(86400);
  expect(durationSeconds("0:01")).toBe(1);
  expect(durationSeconds("20:30")).toBe(1230);
  expect(durationSeconds("1:60")).toBeNull();
  for (const x of [
    "",
    " ",
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e2",
    "abc",
    "1441",
    "0.01",
  ])
    expect(durationSeconds(x)).toBeNull();
});
it("constrains five activities, owner-free payloads and revision/request identities", () => {
  expect(Object.keys(activities)).toHaveLength(5);
  const c: CardioCommand = {
    session: id,
    item: id,
    request: id,
    operation: "save",
    expected: 1,
    activity: "outdoor_run",
    seconds: 1200,
  };
  expect(validCardio(c)).toBe(true);
  for (const patch of [
    { session: "foreign-name" },
    { seconds: 0 },
    { seconds: 86401 },
    { seconds: null },
    { seconds: 1.5 },
    { expected: -1 },
    { request: "" },
  ])
    expect(validCardio({ ...c, ...patch })).toBe(false);
  expect(
    validCardio({ ...c, operation: "add", seconds: null, expected: 0 }),
  ).toBe(true);
  expect(validCardio({ ...c, operation: "remove", seconds: 1200 })).toBe(false);
});
it("counts duration evidence separately from pending entries", () => {
  expect(
    cardioTotals([
      {
        id,
        revision: 1,
        activity: "bike",
        durationSeconds: null,
        completedAt: null,
      },
      {
        id: id + "x",
        revision: 2,
        activity: "treadmill",
        durationSeconds: 1200,
        completedAt: "2026-11-11T00:00:00Z",
      },
    ]),
  ).toEqual({ completed: 1, pending: 1, seconds: 1200 });
  expect(cardioTotals()).toEqual({ completed: 0, pending: 0, seconds: 0 });
});
