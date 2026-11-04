import { expect, it } from "vitest";
import {
  performanceDominates,
  selectAchievements,
  type PerformancePoint,
  type Achievement,
} from "./model";
const point = (
  weight_kg: number | null,
  reps: number,
  category: PerformancePoint["category"] = "loaded",
  exercise_id = "bench",
): PerformancePoint => ({ weight_kg, reps, category, exercise_id });
it("225 x 5 dominates 225 x 3, never the reverse or an equal tie", () => {
  expect(performanceDominates(point(225, 5), point(225, 3))).toBe(true);
  expect(performanceDominates(point(225, 3), point(225, 5))).toBe(false);
  expect(performanceDominates(point(225, 5), point(225, 5))).toBe(false);
});
it("weight/repetition tradeoffs remain nondominated", () => {
  expect(performanceDominates(point(235, 3), point(225, 5))).toBe(false);
  expect(performanceDominates(point(185, 10), point(225, 5))).toBe(false);
});
it("requires exact exercise and comparable measurement context", () => {
  expect(
    performanceDominates(point(225, 5), point(225, 3, "loaded", "incline")),
  ).toBe(false);
  expect(
    performanceDominates(point(20, 10, "added"), point(null, 8, "bodyweight")),
  ).toBe(false);
  expect(
    performanceDominates(
      point(null, 10, "bodyweight"),
      point(null, 8, "bodyweight"),
    ),
  ).toBe(true);
});
it("uses canonical precision and excludes invalid performance", () => {
  expect(performanceDominates(point(22.68000001, 5), point(22.68, 5))).toBe(
    false,
  );
  expect(performanceDominates(point(NaN, 10), point(10, 5))).toBe(false);
  expect(performanceDominates(point(100, 0), point(20, 5))).toBe(false);
});
const achievement = (
  id: string,
  metric: Achievement["metric"] = "actual_rm",
  load_key = 3,
  dominated = false,
): Achievement => ({
  exercise_id: id,
  exercise_name: id,
  category: "loaded",
  metric,
  load_key,
  dominated_in_session: dominated,
  previous_value: 80,
  value: 100,
  session_id: "s",
  set_id: "set",
  weight_kg: 100,
  reps: load_key,
  entered_weight: null,
  entered_unit: null,
  performed_at: "2026-01-01",
});
it("prefers nondominated current performance without mutating exact records or candidates", () => {
  const triple = achievement("bench", "actual_rm", 3, true),
    five = achievement("bench", "actual_rm", 5, false);
  expect(selectAchievements([triple, five])).toEqual([five]);
  expect(triple.value).toBe(100);
  expect(selectAchievements([triple])).toEqual([triple]);
});
it("limits to three diverse exercises and stable categories independent of input order", () => {
  const rows = [
    achievement("a"),
    achievement("a", "volume"),
    achievement("b"),
    achievement("c", "volume"),
    achievement("d", "estimated_1rm"),
  ];
  const selected = selectAchievements(rows);
  expect(selected).toHaveLength(3);
  expect(new Set(selected.map((a) => a.exercise_id)).size).toBe(3);
  expect(new Set(selected.map((a) => a.metric)).size).toBeGreaterThan(1);
  expect(selectAchievements([...rows].reverse())).toEqual(selected);
});
