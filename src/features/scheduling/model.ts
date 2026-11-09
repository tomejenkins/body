export type ScheduleEvent = {
  assignmentId: string;
  date: string;
  position?: number;
  rotation?: number;
  dayId?: string;
  sessionId?: string;
  kind: "rest" | "workout";
  status:
    | "skipped"
    | "accepted_partial"
    | "deferred"
    | "defer_cancelled"
    | "completed"
    | "recorded_partial"
    | "overdue"
    | "recovery"
    | "planned_rest"
    | "scheduled"
    | "due";
  name: string;
  recommended: boolean;
  targetDate?: string;
  originalDueOn?: string;
  carried?: boolean;
};
export type Schedule = {
  assignmentId: string;
  configured: boolean;
  state: string;
  name?: string;
  version?: string;
  timezone?: string;
  startDate?: string;
  today?: string;
  from?: string;
  until?: string;
  next?: {
    position: number;
    rotation: number;
    number: number;
    name: string;
    dayId: string;
    dueOn: string;
    readyOn: string;
    recommendedOn: string;
    completedRotations: number;
  } | null;
  programComplete?: boolean;
  progress?: {
    position: number;
    rotation: number;
    workIndex: number;
    completedRotations: number;
    complete: boolean;
    lastTrainingOn: string | null;
    lastCompleted: {
      sessionId: string;
      position: number;
      rotation: number;
      date: string;
    } | null;
  };
  events?: ScheduleEvent[];
};
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const instant = Date.parse(`${value}T12:00:00Z`);
  return (
    Number.isFinite(instant) &&
    new Date(instant).toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" &&
    value <= "2200-01-01"
  );
}
export function dateOffset(date: string, days: number) {
  if (!validDate(date) || !Number.isSafeInteger(days) || Math.abs(days) > 3660)
    throw Error("Invalid calendar date");
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function localDate(zone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}
export const scheduleStatus = {
  skipped: "Skipped",
  accepted_partial: "Partial accepted · scheduling only",
  deferred: "Deferred",
  defer_cancelled: "Deferral cancelled",
  completed: "Completed",
  recorded_partial: "Partial training recorded",
  overdue: "Overdue · carried forward",
  planned_rest: "Planned Rest",
  recovery: "Recovery guidance",
  scheduled: "Scheduled",
  due: "Due",
} as const;
