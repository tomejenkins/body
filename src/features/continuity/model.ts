import { durationLabel } from "@/features/history/model";
export type Continuity = {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  state: "active" | "quiet" | "check_in" | "expired" | "closed";
  server_now: string;
  started_at: string;
  last_activity_at: string | null;
  activity_evidence_at: string | null;
  finished_at: string | null;
  effective_finished_at: string | null;
  duration_kind: "legacy" | "elapsed" | "estimated" | "unknown";
  closure_reason: "finished" | "abandoned" | "inactivity" | null;
  idle_intervals: {
    from: string | null;
    to: string;
    legacy_unknown?: boolean;
  }[];
  completed: number;
  total: number;
  continuation_count: number;
};
export type DurationData = Pick<
  Continuity,
  | "started_at"
  | "finished_at"
  | "effective_finished_at"
  | "duration_kind"
  | "idle_intervals"
>;
export function recoveredDuration(value: Continuity) {
  if (!value.activity_evidence_at || !value.last_activity_at) return null;
  return durationLabel(value.started_at, value.last_activity_at);
}
export function qualifiedDuration(value: DurationData) {
  const end =
    value.duration_kind === "legacy"
      ? value.finished_at
      : value.effective_finished_at;
  const duration = durationLabel(value.started_at, end);
  if (!duration) return "Duration unavailable";
  const prefix =
    value.duration_kind === "estimated"
      ? "Estimated workout duration"
      : value.duration_kind === "legacy"
        ? "Elapsed session (legacy)"
        : "Elapsed session";
  return `${prefix}: ${duration}${value.idle_intervals.length ? " · Includes an inactive interval" : ""}`;
}
export function closureExplanation(reason: Continuity["closure_reason"]) {
  return reason === "inactivity"
    ? "This workout was closed after 12 hours without saved activity. Completed and pending sets were kept."
    : reason === "abandoned"
      ? "Workout abandoned. Your saved work was kept."
      : "";
}
