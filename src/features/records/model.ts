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
      : `Actual ${metric.load_key}RM`;
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
    importance[a.metric] +
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
  return sorted
    .filter((a) => {
      if (seen.has(a.exercise_id)) return false;
      seen.add(a.exercise_id);
      return true;
    })
    .slice(0, 3);
}
