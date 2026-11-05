import type { RecordMetric, RecordCategory } from "@/features/records/model";
export const ranges = [
  ["30", "30 days"],
  ["90", "90 days"],
  ["6m", "6 months"],
  ["1y", "1 year"],
  ["all", "All time"],
] as const;
export type ProgressRange = (typeof ranges)[number][0];
export type ProgressWindow = {
  range: ProgressRange;
  zone: string;
  today: string;
  from_day: string | null;
  until_day: string;
  from: string | null;
  until: string;
};
export type ProgressSeries = {
  category: RecordCategory;
  metric: RecordMetric["metric"];
  load_key: number;
  total_points: number;
  points: RecordMetric[];
};
export type ExerciseProgress = {
  window: ProgressWindow;
  loads: { category: "loaded" | "added"; kg: number }[];
  selected_load: number | null;
  selected_category: "loaded" | "added" | null;
  observed_reps: number[];
  selected_reps: number | null;
  series: ProgressSeries[];
};
export type TrainingProgress = {
  window: ProgressWindow;
  summary: {
    completed_workouts: number;
    training_days: number;
    reliable_durations: number;
    estimated_durations: number;
    unreliable_durations: number;
    average_seconds: number | null;
    previous_workouts: number | null;
    comparison_available: boolean;
    recent_weekly_frequency: number;
  };
  working_sets: number;
  calendar_month: string;
  calendar: { day: string; workouts: number; first_session: string }[];
  bucket_weeks: number;
  exercises: { exercise_id: string; name: string; sets: number }[];
  selected_exercise: string | null;
  weekly: {
    week: string;
    until_day: string;
    working_sets: number;
    bodyweight_sets: number;
    bodyweight_reps: number;
  }[];
  volumes: {
    week: string;
    until_day: string;
    exercise_id: string;
    category: "loaded" | "added";
    value: number;
  }[];
  muscles: {
    week: string;
    until_day: string;
    muscle_group_id: string | null;
    name: string;
    primary_sets: number;
    secondary_sets: number;
  }[];
};
export function localDay(timestamp: string, zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}
export function monthDays(month: string) {
  const [y, m] = month.split("-").map(Number);
  return Array.from(
    { length: new Date(Date.UTC(y, m, 0)).getUTCDate() },
    (_, i) =>
      `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );
}
export function shiftMonth(month: string, step: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 10);
}
export function loadValue(kg: number, unit: "kg" | "lb") {
  return kg * (unit === "lb" ? 1 / 0.45359237 : 1);
}
export function numberLabel(n: number, unit: "kg" | "lb" = "kg") {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: unit === "lb" ? 2 : 3,
  }).format(n);
}
export function seriesKey(
  s: Pick<ProgressSeries, "category" | "metric" | "load_key">,
) {
  return `${s.category}:${s.metric}:${s.load_key}`;
}
export function validRange(value: unknown): value is ProgressRange {
  return ranges.some(([r]) => r === value);
}
export function validZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export function validMonth(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value) &&
    value >= "1900-01-01"
  );
}
