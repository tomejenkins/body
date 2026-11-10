import {
  draftFor,
  type LoggedSet,
  type WeightUnit,
} from "@/features/sets/model";
import { isUuid } from "@/features/exercises/validation";
import type { WorkoutStatus } from "@/features/workouts/types";
export type LoggingKind =
  "legacy" | "loaded" | "bodyweight" | "assisted" | "duration";
export type HistoryFilter =
  "all" | "completed" | "incomplete" | "abandoned" | "archived";
export type HistorySummary = {
  id: string;
  name: string;
  status: WorkoutStatus;
  completion_status: "none" | "partial" | "full";
  started_at: string;
  finished_at: string | null;
  exercise_count: number;
  working_sets: number;
  warm_up_sets: number;
  incomplete_sets: number;
  effective_finished_at?: string | null;
  duration_kind?: import("@/features/continuity/model").Continuity["duration_kind"];
  closure_reason?: string | null;
  idle_intervals?: import("@/features/continuity/model").Continuity["idle_intervals"];
  recognition_enabled?: boolean;
  achievement_count?: number;
  manual_pause_intervals?: import("@/features/continuity/timer").PauseInterval[];
};
export type ExerciseHistory = {
  total_sessions: number;
  last_performed: string | null;
  entries: {
    id: string;
    name: string;
    started_at: string;
    finished_at: string;
    item_id: string;
    exercise_name_snapshot: string;
    logging_kind: LoggingKind;
    sets: LoggedSet[];
  }[];
};
export function friendlyWorkoutName(name: string) {
  return /^(ad[- ]hoc (workout|session))$/i.test(name.trim())
    ? "Workout"
    : name;
}
export function historyStatus(
  status: WorkoutStatus,
  completion: "none" | "partial" | "full",
) {
  return status === "abandoned"
    ? "Abandoned"
    : status === "in_progress"
      ? "In progress"
      : completion === "full"
        ? "Finished"
        : completion === "none"
          ? "Finished · No completed sets"
          : "Finished · Partly completed";
}
export function durationLabel(start: string, end: string | null) {
  if (!end) return null;
  const milliseconds = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  const minutes = Math.floor(milliseconds / 60000);
  return minutes < 1
    ? "Less than a minute"
    : minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}
export function localTimestamp(value: string, zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(value));
}
export function historyFilter(value: unknown): HistoryFilter {
  return ["all", "completed", "incomplete", "abandoned", "archived"].includes(
    String(value),
  )
    ? (value as HistoryFilter)
    : "all";
}
export function pageCursor(
  value: unknown,
): { before: string; beforeId: string } | null {
  if (typeof value !== "string" || value.length > 150) return null;
  const [before, beforeId, ...extra] = value.split("|");
  return !extra.length &&
    isUuid(beforeId) &&
    /^\d{4}-\d{2}-\d{2}T/.test(before) &&
    Number.isFinite(Date.parse(before))
    ? { before, beforeId }
    : null;
}
export function cursorFor(date: string, id: string) {
  return `${date}|${id}`;
}
export function performanceLabel(
  row: LoggedSet,
  unit: WeightUnit,
  kind: LoggingKind,
) {
  const values = draftFor(row, unit);
  const actual = row.status === "completed";
  const prefix = actual
    ? ""
    : row.inputs_confirmed === false
      ? "Pending · Suggested "
      : row.status === "skipped"
        ? "Skipped · "
        : "Pending · Entered ";
  const reps = actual
    ? row.actual_reps
    : values.reps === ""
      ? null
      : values.reps;
  if (reps === null && !values.weight)
    return actual
      ? "Measurement unavailable"
      : row.status === "skipped"
        ? "Skipped · No performance recorded"
        : "Pending · No performance recorded";
  if (kind === "duration" || kind === "assisted")
    return `${prefix}Recorded ${reps ?? "—"} reps · Legacy measurement needs review`;
  if (row.load_mode === "bodyweight")
    return `${prefix}${reps ?? "—"} reps · Bodyweight`;
  const added = kind === "bodyweight";
  return `${prefix}${added ? "+" : ""}${values.weight || "—"} ${unit} × ${reps ?? "—"}${added ? " · Added weight" : kind === "legacy" ? " · External load" : ""}`;
}
