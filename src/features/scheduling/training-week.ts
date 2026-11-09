import {
  dateOffset,
  validDate,
  localDate,
  scheduleStatus,
  type Schedule,
  type ScheduleEvent,
} from "./model";
export type TrainingEvent = Omit<ScheduleEvent, "assignmentId"> & {
  assignmentId: string | null;
  source?: "independent" | "other_program";
};
export type WeekTraining = {
  id: string;
  name: string;
  finished_at: string;
  completion_status: "partial" | "full";
  program_assignment_id: string | null;
};
export function monday(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return dateOffset(date, -((weekday + 6) % 7));
}
export function requestedWeek(value: unknown) {
  return validDate(value) && value >= "1900-01-08" && value <= "2199-12-20"
    ? monday(value)
    : null;
}
export function trainingEvents(
  schedule: Schedule,
  training: WeekTraining[],
): TrainingEvent[] {
  const events: TrainingEvent[] = [...(schedule.events ?? [])];
  if (!schedule.timezone || !schedule.from || !schedule.until) return events;
  for (const row of training) {
    if (row.program_assignment_id === schedule.assignmentId) continue; // Program evidence stays SQL-authoritative.
    const date = localDate(schedule.timezone, new Date(row.finished_at));
    if (date < schedule.from || date >= schedule.until) continue;
    events.push({
      assignmentId: row.program_assignment_id,
      date,
      kind: "workout",
      name: row.name,
      status:
        row.completion_status === "full" ? "completed" : "recorded_partial",
      sessionId: row.id,
      recommended: false,
      source: row.program_assignment_id ? "other_program" : "independent",
    });
  }
  return events;
}
const priority: Record<ScheduleEvent["status"], number> = {
  due: 0,
  completed: 1,
  recorded_partial: 2,
  accepted_partial: 3,
  skipped: 4,
  deferred: 5,
  overdue: 6,
  defer_cancelled: 7,
  recovery: 8,
  planned_rest: 9,
  scheduled: 10,
};
export function dayEvents(events: TrainingEvent[], date: string) {
  return events
    .filter((e) => e.date === date)
    .sort(
      (a, b) =>
        priority[a.status] - priority[b.status] ||
        a.name.localeCompare(b.name, "en") ||
        (a.sessionId ?? "").localeCompare(b.sessionId ?? "") ||
        (a.targetDate ?? "").localeCompare(b.targetDate ?? ""),
    );
}
export function eventLabel(e: TrainingEvent) {
  return [
    e.name,
    e.source === "independent"
      ? "Independent training"
      : e.source === "other_program"
        ? "Other program training"
        : "",
    e.recommended ? "Recommended" : "",
    scheduleStatus[e.status],
    e.carried ? "Carried forward" : "",
    e.targetDate ? `Until ${e.targetDate}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
export const statusSymbol: Record<ScheduleEvent["status"], string> = {
  completed: "✓",
  recorded_partial: "◐",
  accepted_partial: "≈",
  due: "●",
  scheduled: "○",
  planned_rest: "—",
  recovery: "~",
  overdue: "!",
  deferred: "↗",
  skipped: "↦",
  defer_cancelled: "↶",
};
export function recommendationFields(s: Schedule) {
  if (
    !s.configured ||
    s.state !== "active" ||
    s.programComplete ||
    !s.next ||
    !s.progress ||
    !s.version
  )
    return null;
  return {
    assignment: s.assignmentId,
    version: s.version,
    day: s.next.dayId,
    rotation: s.next.rotation,
    expected: s.progress.workIndex,
    revision: s.progress.decisionRevision,
  };
}
