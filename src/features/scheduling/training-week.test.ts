import { expect, it } from "vitest";
import {
  monday,
  requestedWeek,
  trainingEvents,
  dayEvents,
  recommendationFields,
  eventLabel,
} from "./training-week";
import type { Schedule } from "./model";
const s: Schedule = {
  assignmentId: "assigned",
  configured: true,
  state: "active",
  version: "version",
  from: "2026-11-09",
  until: "2026-11-16",
  today: "2026-11-09",
  timezone: "Pacific/Auckland",
  events: [],
};
it("normalizes weeks and safely bounds arbitrary route values across DST/month/year", () => {
  expect(monday("2027-01-01")).toBe("2026-12-28");
  expect(monday("2026-03-08")).toBe("2026-03-02");
  expect(monday("2026-11-01")).toBe("2026-10-26");
  expect(requestedWeek("2026-11-15")).toBe("2026-11-09");
  for (const v of [
    undefined,
    ["2026-11-09"],
    "2026-02-31",
    "1900-01-01",
    "2200-01-01",
  ])
    expect(requestedWeek(v)).toBeNull();
});
it("adds genuine independent history by the fixed assignment completion date without program progress or duplicates", () => {
  const row = {
    id: "favorite",
    name: "Saved press",
    completion_status: "partial" as const,
    finished_at: "2026-11-08T16:30:00Z",
    program_assignment_id: null,
    favorite_workout_id: "fav",
  };
  const events = trainingEvents(s, [
    row,
    { ...row, id: "program", program_assignment_id: "assigned" },
    { ...row, id: "outside", finished_at: "2026-11-16T20:00:00Z" },
  ]);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    date: "2026-11-09",
    sessionId: "favorite",
    status: "recorded_partial",
    source: "independent",
    assignmentId: null,
    recommended: false,
  });
  expect(eventLabel(events[0])).toContain("Independent training");
});
it("keeps every event and orders multi-event days deterministically, leaving empty dates empty", () => {
  const e = {
    assignmentId: "assigned",
    date: "2026-11-09",
    kind: "workout" as const,
    name: "Press",
    recommended: false,
  };
  const events = dayEvents(
    [
      { ...e, status: "accepted_partial", sessionId: "partial" },
      { ...e, status: "recorded_partial", sessionId: "partial" },
      { ...e, status: "due", recommended: true },
      { ...e, status: "overdue" },
    ],
    e.date,
  );
  expect(events.map((e) => e.status)).toEqual([
    "due",
    "recorded_partial",
    "accepted_partial",
    "overdue",
  ]);
  expect(dayEvents(events, "2026-11-10")).toEqual([]);
});
it("uses the RPC occurrence/revision for starts and never creates a recommendation for completed/archived/unconfigured programs", () => {
  const value = {
    ...s,
    next: {
      dayId: "day",
      rotation: 3,
      position: 5,
      number: 2,
      name: "Back",
      dueOn: "2026-11-08",
      readyOn: "2026-11-09",
      recommendedOn: "2026-11-09",
      completedRotations: 2,
    },
    progress: {
      position: 5,
      rotation: 3,
      workIndex: 10,
      decisionRevision: 7,
      completedRotations: 2,
      complete: false,
      lastTrainingOn: null,
      lastCompleted: null,
    },
  };
  expect(recommendationFields(value)).toEqual({
    assignment: "assigned",
    version: "version",
    day: "day",
    rotation: 3,
    expected: 10,
    revision: 7,
  });
  for (const v of [
    { ...value, configured: false },
    { ...value, state: "archived" },
    { ...value, programComplete: true },
    { ...value, next: null },
  ])
    expect(recommendationFields(v)).toBeNull();
});
