import type { Continuity } from "./model";
export type PauseInterval = { from: string; to: string };
// Pure formatting/history fallback. Live anchors always originate in server state.
export function secondsExcludingPauses(
  start: string,
  end: string | null,
  intervals: readonly PauseInterval[] = [],
) {
  if (!end) return null;
  const a = Date.parse(start),
    b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  if (
    intervals.some(
      (p) =>
        !Number.isFinite(Date.parse(p.from)) ||
        !Number.isFinite(Date.parse(p.to)) ||
        Date.parse(p.to) < Date.parse(p.from),
    )
  )
    return null;
  const ranges = intervals
    .map((p) => [
      Math.max(a, Date.parse(p.from)),
      Math.min(b, Date.parse(p.to)),
    ])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && y > x)
    .sort((x, y) => x[0] - y[0]);
  let excluded = 0,
    last = a;
  for (const [x, y] of ranges) {
    excluded += Math.max(0, y - Math.max(last, x));
    last = Math.max(last, y);
  }
  return Math.max(0, (b - a - excluded) / 1000);
}
export function timerLabel(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "--:--";
  const n = Math.max(0, Math.floor(seconds));
  return `${n >= 3600 ? Math.floor(n / 3600) + ":" : ""}${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export function timerRunning(value: Continuity) {
  return value.status === "in_progress" && !value.manual_paused_at;
}
export function newerTimerState(next: Continuity, previous: Continuity | null) {
  if (!previous || next.id !== previous.id) return true;
  if (previous.status !== "in_progress" && next.status === "in_progress")
    return false;
  const revision = next.timer_revision ?? 0,
    oldRevision = previous.timer_revision ?? 0;
  if (revision !== oldRevision) return revision > oldRevision;
  return Date.parse(next.server_now) >= Date.parse(previous.server_now);
}
