import { secondsExcludingPauses, type PauseInterval } from "./timer";
import { durationLabel } from "@/features/history/model";
export type Continuity = {
  manual_paused_at?: string | null;
  manual_pause_intervals?: PauseInterval[];
  timer_revision?: number;
  effective_elapsed_seconds?: number | null;
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
  | "manual_pause_intervals"
>;
export function recoveredDuration(value: Continuity) {
  if (!value.activity_evidence_at || !value.last_activity_at) return null;
  const seconds = secondsExcludingPauses(
    value.started_at,
    value.last_activity_at,
    [
      ...(value.manual_pause_intervals ?? []),
      ...(value.manual_paused_at &&
      Date.parse(value.manual_paused_at) < Date.parse(value.last_activity_at)
        ? [{ from: value.manual_paused_at, to: value.last_activity_at }]
        : []),
    ],
  );
  return seconds == null
    ? null
    : durationLabel(
        "1970-01-01T00:00:00Z",
        new Date(seconds * 1000).toISOString(),
      );
}
export function qualifiedDuration(value: DurationData) {
  const end =
    value.duration_kind === "legacy"
      ? value.finished_at
      : value.effective_finished_at;
  const seconds = secondsExcludingPauses(
    value.started_at,
    end,
    value.manual_pause_intervals,
  );
  const duration =
    seconds == null
      ? null
      : durationLabel(
          "1970-01-01T00:00:00Z",
          new Date(seconds * 1000).toISOString(),
        );
  if (!duration) return "Duration unavailable";
  const prefix =
    value.duration_kind === "estimated"
      ? "Estimated workout duration"
      : value.duration_kind === "legacy"
        ? "Elapsed session (legacy)"
        : value.manual_pause_intervals?.length
          ? "Effective session"
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
