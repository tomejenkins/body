import type { WeightUnit } from "@/features/sets/model";
import { recordProfile } from "./prominence";
export type RecordCategory = "loaded" | "added" | "bodyweight";
export type MetricName =
  | "heaviest"
  | "added_load"
  | "actual_rm"
  | "estimated_1rm"
  | "reps_at_load"
  | "bodyweight_reps"
  | "volume";
export type RecordMetric = {
  exercise_id: string;
  session_id: string;
  category: RecordCategory;
  metric: MetricName;
  load_key: number;
  value: number;
  set_id: string | null;
  performed_at: string;
  weight_kg: number | null;
  reps: number | null;
  entered_weight: number | null;
  entered_unit: WeightUnit | null;
};
export type ExerciseRecords = {
  exercise_id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  metrics: RecordMetric[];
};
export type Achievement = RecordMetric & {
  previous_value: number;
  dominated_in_session?: boolean;
  exercise_name: string;
};
export function estimatedOneRm(kg: number, reps: number): number | null {
  if (
    !Number.isFinite(kg) ||
    kg <= 0 ||
    !Number.isInteger(reps) ||
    reps < 1 ||
    reps > 10
  )
    return null;
  return reps === 1 ? kg : Math.round(((kg * (30 + reps)) / 30) * 1000) / 1000;
}
export function exactRepMaximum(
  sets: readonly { reps: number; kg: number }[],
  reps: number,
) {
  const eligible = sets.filter(
    (s) =>
      s.reps === reps &&
      Number.isInteger(s.reps) &&
      s.reps > 0 &&
      Number.isFinite(s.kg) &&
      s.kg > 0,
  );
  return eligible.length ? Math.max(...eligible.map((s) => s.kg)) : null;
}
export function metricLabel(metric: RecordMetric) {
  if (metric.metric === "actual_rm")
    return metric.category === "added"
      ? `Actual ${metric.load_key}-rep Added Load`
      : ({ 1: "Best Single", 3: "Best Triple", 5: "Best Five-Rep Set" }[
          metric.load_key
        ] ?? `Best ${metric.load_key}-Rep Set`);
  return {
    heaviest: "Heaviest Lift",
    added_load: "Heaviest Added Resistance",
    estimated_1rm: "Estimated 1RM",
    reps_at_load: "Most Reps at This Load",
    bodyweight_reps: "Most Bodyweight Reps",
    volume:
      metric.category === "added"
        ? "Added Resistance Volume"
        : "Best Session Volume",
  }[metric.metric];
}
export function formattedMetric(metric: RecordMetric, unit: WeightUnit) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: unit === "kg" ? 3 : 2,
    }).format(n);
  if (metric.metric === "bodyweight_reps") return `${metric.value} reps`;
  const actual = ["heaviest", "added_load", "actual_rm"].includes(
    metric.metric,
  );
  const kg = metric.metric === "reps_at_load" ? metric.load_key : metric.value;
  const load =
    actual && metric.entered_unit === unit && metric.entered_weight !== null
      ? String(metric.entered_weight)
      : fmt(kg * (unit === "lb" ? 1 / 0.45359237 : 1));
  if (metric.metric === "reps_at_load") {
    const weight =
      metric.entered_unit === unit && metric.entered_weight !== null
        ? String(metric.entered_weight)
        : load;
    return `${metric.value} reps at ${metric.category === "added" ? "+" : ""}${weight} ${unit}`;
  }
  return `${metric.category === "added" && metric.metric !== "volume" ? "+" : ""}${load} ${unit}${metric.metric === "volume" ? " × reps" : ""}`;
}
const importance: Record<MetricName, number> = {
  heaviest: 40,
  added_load: 40,
  bodyweight_reps: 40,
  actual_rm: 35,
  estimated_1rm: 25,
  reps_at_load: 30,
  volume: 20,
};
export function selectAchievements(rows: readonly Achievement[]) {
  const score = (a: Achievement) =>
    importance[a.metric] -
    (a.dominated_in_session ? 30 : 0) +
    Math.min(((a.value - a.previous_value) / a.previous_value) * 100, 100) *
      0.5 +
    { primary: 10, secondary: 5, standard: 0 }[
      recordProfile(a.exercise_id).prominence
    ];
  const sorted = rows
    .filter((a) => a.previous_value > 0 && a.value > a.previous_value)
    .toSorted(
      (a, b) =>
        score(b) - score(a) ||
        a.exercise_id.localeCompare(b.exercise_id) ||
        a.metric.localeCompare(b.metric) ||
        a.category.localeCompare(b.category) ||
        a.load_key - b.load_key,
    );
  const seen = new Set<string>();
  const categories = new Set<string>();
  const chosen: Achievement[] = [];
  const group = (a: Achievement) =>
    a.metric === "volume"
      ? "volume"
      : a.metric === "estimated_1rm"
        ? "estimate"
        : a.metric === "reps_at_load" || a.metric === "bodyweight_reps"
          ? "reps"
          : "strength";
  while (chosen.length < 3) {
    const next = sorted
      .filter((a) => !seen.has(a.exercise_id))
      .toSorted(
        (a, b) =>
          score(b) +
            (categories.has(group(b)) ? 0 : 10) -
            (score(a) + (categories.has(group(a)) ? 0 : 10)) ||
          a.exercise_id.localeCompare(b.exercise_id) ||
          a.metric.localeCompare(b.metric) ||
          a.category.localeCompare(b.category) ||
          a.load_key - b.load_key,
      )[0];
    if (!next) break;
    chosen.push(next);
    seen.add(next.exercise_id);
    categories.add(group(next));
  }
  return chosen;
}
export type PerformancePoint = {
  exercise_id: string;
  category: RecordCategory;
  weight_kg: number | null;
  reps: number;
};
export function performanceDominates(a: PerformancePoint, b: PerformancePoint) {
  if (
    a.exercise_id !== b.exercise_id ||
    a.category !== b.category ||
    !Number.isInteger(a.reps) ||
    !Number.isInteger(b.reps) ||
    a.reps <= 0 ||
    b.reps <= 0 ||
    a.reps > 1000 ||
    b.reps > 1000
  )
    return false;
  if (a.category === "bodyweight")
    return a.weight_kg === null && b.weight_kg === null && a.reps > b.reps;
  if (
    a.weight_kg === null ||
    b.weight_kg === null ||
    !Number.isFinite(a.weight_kg) ||
    !Number.isFinite(b.weight_kg) ||
    a.weight_kg <= 0 ||
    b.weight_kg <= 0
  )
    return false;
  const ak = Math.round(a.weight_kg * 1000),
    bk = Math.round(b.weight_kg * 1000);
  return ak >= bk && a.reps >= b.reps && (ak > bk || a.reps > b.reps);
}
