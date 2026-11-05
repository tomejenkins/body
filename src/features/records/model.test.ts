import { expect, it } from "vitest";
import {
  estimatedOneRm,
  exactRepMaximum,
  formattedMetric,
  metricLabel,
  selectAchievements,
  type Achievement,
  type RecordMetric,
} from "./model";
it("a heavier five-rep set NEVER changes an actual three-rep record", () => {
  const baseline = [{ reps: 3, kg: 100 }];
  const sets = [...baseline, { reps: 5, kg: 235 * 0.45359237 }];
  expect(exactRepMaximum(sets, 3)).toBe(exactRepMaximum(baseline, 3));
  expect(exactRepMaximum(sets, 5)).toBe(235 * 0.45359237);
  expect(exactRepMaximum(sets, 1)).toBeNull();
  expect(exactRepMaximum(sets, 8)).toBeNull();
});
it("exact records require valid matching positive reps/load", () => {
  const sets = [
    { reps: 3, kg: 90 },
    { reps: 3, kg: 100 },
    { reps: 1, kg: 95 },
    { reps: 8, kg: 80 },
    { reps: 3, kg: NaN },
    { reps: 3, kg: -5 },
  ];
  expect(exactRepMaximum(sets, 1)).toBe(95);
  expect(exactRepMaximum(sets, 3)).toBe(100);
  expect(exactRepMaximum(sets, 8)).toBe(80);
});
it("Epley is separately estimated, limited to 1–10 and rounded once", () => {
  expect(estimatedOneRm(100, 1)).toBe(100);
  expect(estimatedOneRm(100, 3)).toBe(110);
  expect(estimatedOneRm(100, 5)).toBe(116.667);
  expect(estimatedOneRm(100, 10)).toBe(133.333);
  for (const [kg, reps] of [
    [0, 3],
    [-1, 3],
    [NaN, 3],
    [100, 0],
    [100, 11],
    [100, 2.5],
  ])
    expect(estimatedOneRm(kg, reps)).toBeNull();
});
const metric: RecordMetric = {
  exercise_id: "a",
  session_id: "s",
  category: "loaded",
  metric: "actual_rm",
  load_key: 5,
  value: 106.594,
  set_id: "set",
  performed_at: "2025-01-01",
  weight_kg: 106.594,
  reps: 5,
  entered_weight: 235,
  entered_unit: "lb",
};
it("labels actual RM, heaviest and estimate distinctly and retains exact entered units", () => {
  expect(metricLabel(metric)).toBe("Best Five-Rep Set");
  expect(formattedMetric(metric, "lb")).toBe("235 lb");
  expect(metricLabel({ ...metric, metric: "heaviest" })).toBe("Heaviest Lift");
  expect(metricLabel({ ...metric, metric: "estimated_1rm" })).toBe(
    "Estimated 1RM",
  );
  expect(
    formattedMetric(
      {
        ...metric,
        metric: "bodyweight_reps",
        category: "bodyweight",
        value: 12,
      },
      "kg",
    ),
  ).toBe("12 reps");
  expect(formattedMetric({ ...metric, category: "added" }, "lb")).toBe(
    "+235 lb",
  );
});
const achievement = (
  id: string,
  patch: Partial<Achievement> = {},
): Achievement => ({
  ...metric,
  exercise_id: id,
  exercise_name: id,
  previous_value: 100,
  metric: "heaviest",
  ...patch,
});
it("ranks deterministically, permits any exercise and displays at most three diverse improvements", () => {
  const rows = [
    achievement("a"),
    achievement("a", { metric: "volume", value: 600, previous_value: 200 }),
    achievement("b"),
    achievement("c"),
    achievement("d"),
  ];
  const chosen = selectAchievements(rows);
  expect(chosen).toHaveLength(3);
  expect(new Set(chosen.map((a) => a.exercise_id)).size).toBe(3);
  expect(selectAchievements([...rows].reverse())).toEqual(chosen);
});
it("first baselines and ties cannot be celebrated", () => {
  expect(
    selectAchievements([
      achievement("a", { previous_value: 0 }),
      achievement("b", { value: 100 }),
      achievement("c", { value: 99 }),
    ]),
  ).toEqual([]);
});
