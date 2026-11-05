import { expect, it } from "vitest";
import {
  validateProgression,
  progressionColumns,
  validateRotation,
  nextRotationPosition,
} from "./model";
it("supports nonweekly 3/5/8/10/366-day rotations and ordered rest days", () => {
  for (const length of [3, 5, 8, 10, 366]) {
    const days = Array.from({ length }, (_, i) => ({
      position: i + 1,
      name: `Day ${i + 1}`,
      rest: i % 4 === 3,
    }));
    expect(validateRotation(length, days)).toBe(true);
    expect(nextRotationPosition(length, length)).toBe(1);
  }
  expect(validateRotation(0, [])).toBe(false);
  expect(validateRotation(367, [])).toBe(false);
  expect(
    validateRotation(3, [
      { position: 1, name: "A", rest: false },
      { position: 1, name: "B", rest: true },
      { position: 3, name: "C", rest: false },
    ]),
  ).toBe(false);
});
it("represents six typed strategies without executing arbitrary expressions", () => {
  const rules = [
    { version: 1, strategy: "fixed" },
    { version: 1, strategy: "manual" },
    { version: 1, strategy: "linear_load", loadStepKg: 2.5 },
    {
      version: 1,
      strategy: "double_progression",
      loadStepKg: 2.5,
      repStep: 1,
      repsMin: 8,
      repsMax: 12,
    },
    {
      version: 1,
      strategy: "rep_progression",
      repStep: 1,
      repsMin: 6,
      repsMax: 10,
    },
    {
      version: 1,
      strategy: "effort_guided",
      loadStepKg: 1,
      scale: "rir",
      target: 2,
    },
  ];
  for (const rule of rules) {
    expect(validateProgression(rule)).toBe(true);
    if (validateProgression(rule))
      expect(progressionColumns(rule).strategy).toBe(rule.strategy);
  }
  for (const rule of [
    { version: 2, strategy: "fixed" },
    { version: 1, strategy: "manual", formula: "eval()" },
    { version: 1, strategy: "linear_load", loadStepKg: -1 },
    {
      version: 1,
      strategy: "effort_guided",
      loadStepKg: 2,
      scale: "rir",
      target: 8,
    },
    {
      version: 1,
      strategy: "double_progression",
      loadStepKg: 2,
      repStep: 1,
      repsMin: 12,
      repsMax: 8,
    },
  ])
    expect(validateProgression(rule)).toBe(false);
});
