import type { RecordMetric } from "@/features/records/model";
import { recordProfile } from "@/features/records/prominence";
import { displayWeight, type WeightUnit } from "@/features/sets/model";
export type StrengthComparison = {
  exerciseId: string;
  name: string;
  category: RecordMetric["category"];
  metric: RecordMetric["metric"];
  reps: number | null;
  baseline: RecordMetric;
  later: RecordMetric | null;
  delta: number | null;
};
export type Enrollment = {
  id: string;
  name: string;
  versionId: string | null;
  enrollmentVersionId: string | null;
  originalVersionId: string | null;
  versionNumber: number | null;
  state: "active" | "paused" | "archived" | "completed";
  status: "Active" | "Completed" | "Ended" | "Switched" | "Inactive";
  terminalReason:
    "ended_now" | "ended_after_next" | "switched" | "completed" | null;
  startedAt: string;
  endedAt: string | null;
  asOf: string;
  timezone: string;
  provenance: "server" | "legacy";
  scheduleStart: string | null;
  lifecycleRevision: number;
  pendingEnd: boolean;
  pendingEndAt: string | null;
  triggerSessionId: string | null;
  completionEvidenceChanged: boolean;
  workouts: number;
  fullWorkouts: number;
  partialWorkouts: number;
  completedRotations: number;
  durationRotations: number | null;
  currentRotation: number;
  comparisons: StrengthComparison[];
  comparisonCount: number;
};
export type LifecycleKind =
  "start" | "switch" | "end_now" | "end_after_next" | "cancel_end";
export const lifecycleReasons = {
  ended_now: "Ended by you",
  ended_after_next: "Ended after the next qualifying program workout",
  switched: "Switched to another program",
  completed: "Completed the prescribed program rotations",
};
const day = 86400000;
function civil(value: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (key: string) => Number(parts.find((p) => p.type === key)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}
function calendarInstant(p: ReturnType<typeof civil>) {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
function anniversary(start: ReturnType<typeof civil>, months: number) {
  const monthIndex = start.year * 12 + start.month - 1 + months,
    year = Math.floor(monthIndex / 12),
    month = (monthIndex % 12) + 1;
  return {
    ...start,
    year,
    month,
    day: Math.min(start.day, new Date(Date.UTC(year, month, 0)).getUTCDate()),
  };
}
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
export function enrollmentDuration(
  a: Pick<
    Enrollment,
    "startedAt" | "endedAt" | "asOf" | "timezone" | "provenance"
  >,
) {
  if (a.provenance !== "server")
    return "Duration unavailable · Legacy enrollment";
  const end = a.endedAt ?? a.asOf,
    elapsed = Date.parse(end) - Date.parse(a.startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "Duration unavailable";
  if (elapsed < day) return "Less than a day";
  if (elapsed < 14 * day) return plural(Math.floor(elapsed / day), "day");
  if (elapsed < 56 * day)
    return plural(Math.floor(elapsed / (7 * day)), "week");
  try {
    const first = civil(a.startedAt, a.timezone),
      last = civil(end, a.timezone);
    let months = (last.year - first.year) * 12 + last.month - first.month;
    if (calendarInstant(anniversary(first, months)) > calendarInstant(last))
      months--;
    const days = Math.floor(
      (calendarInstant(last) - calendarInstant(anniversary(first, months))) /
        day,
    );
    const years = Math.floor(months / 12),
      remaining = months % 12;
    return (
      years
        ? [
            plural(years, "year"),
            remaining
              ? plural(remaining, "month")
              : days
                ? plural(days, "day")
                : null,
          ]
        : [plural(months, "month"), days ? plural(days, "day") : null]
    )
      .filter(Boolean)
      .join(", ");
  } catch {
    return "Duration unavailable";
  }
}
export function strengthHighlights(rows: readonly StrengthComparison[]) {
  const result: StrengthComparison[] = [],
    seen = new Set<string>();
  const rank = (c: StrengthComparison) =>
    ({ primary: 0, secondary: 1, standard: 2 })[
      recordProfile(c.exerciseId).prominence
    ];
  const reps = (c: StrengthComparison) =>
    c.reps === 5 ? 0 : c.reps === 3 ? 1 : c.reps === 1 ? 2 : 3;
  for (const c of rows
    .filter(
      (c) =>
        c.metric === "actual_rm" &&
        c.category !== "bodyweight" &&
        c.later &&
        c.delta !== null &&
        c.delta > 0,
    )
    .toSorted(
      (a, b) =>
        rank(a) - rank(b) ||
        reps(a) - reps(b) ||
        a.exerciseId.localeCompare(b.exerciseId) ||
        (a.reps ?? 0) - (b.reps ?? 0),
    )) {
    if (seen.has(c.exerciseId)) continue;
    seen.add(c.exerciseId);
    result.push(c);
    if (result.length === 2) break;
  }
  return result;
}
export function comparisonChange(c: StrengthComparison, unit: WeightUnit) {
  if (!c.later || c.delta === null) return "More comparable training needed";
  if (c.delta === 0) return "No change";
  const sign = c.delta > 0 ? "+" : "−",
    value = Math.abs(c.delta);
  if (c.metric === "bodyweight_reps") return `${sign}${value} reps`;
  return `${sign}${displayWeight(value, unit)} ${unit}${c.metric === "estimated_1rm" ? " estimated" : c.reps ? ` at ${c.reps} reps` : ""}`;
}

export function sameEnrollmentVersion(a: Enrollment | null, version: string) {
  return (
    !!a?.versionId &&
    (a.versionId === version ||
      a.enrollmentVersionId === version ||
      (a.versionNumber === 1 && a.originalVersionId === version))
  );
}
