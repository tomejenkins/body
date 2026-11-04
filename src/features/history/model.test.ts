import { expect, it } from "vitest";
import {
  friendlyWorkoutName,
  durationLabel,
  localTimestamp,
  pageCursor,
  historyFilter,
  performanceLabel,
  historyStatus,
} from "./model";
import type { LoggedSet } from "@/features/sets/model";
const set: LoggedSet = {
  id: "s",
  workout_exercise_id: "e",
  position: 1,
  set_type: "working",
  load_mode: "external",
  status: "completed",
  actual_reps: 8,
  actual_weight_kg: 22.68,
  entered_weight: 50,
  entered_unit: "lb",
  completed_at: "2020-01-01T00:00:00Z",
  revision: 1,
  last_mutation_id: null,
  deleted_at: null,
};
it("uses safe friendly names without rewriting custom names", () => {
  expect(friendlyWorkoutName("Ad-hoc workout")).toBe("Workout");
  expect(friendlyWorkoutName("Ad hoc session")).toBe("Workout");
  expect(friendlyWorkoutName("My ad-hoc workout")).toBe("My ad-hoc workout");
});
it("keeps session completion separate from set completion", () => {
  expect(historyStatus("completed", "partial")).toBe(
    "Finished · Partly completed",
  );
  expect(historyStatus("completed", "none")).toContain("No completed sets");
  expect(historyStatus("abandoned", "partial")).toBe("Abandoned");
});
it("formats elapsed durations across midnight without guessing active duration", () => {
  expect(durationLabel("2020-01-01T23:30:00Z", "2020-01-02T00:30:00Z")).toBe(
    "1 hr 0 min",
  );
  expect(durationLabel("2020-01-01T00:00:00Z", null)).toBeNull();
  expect(durationLabel("2020-01-02", "2020-01-01")).toBeNull();
});
it("uses explicit local zones with daylight saving and midnight boundaries", () => {
  expect(
    localTimestamp("2026-03-08T09:30:00Z", "America/Los_Angeles"),
  ).toContain("1:30 AM");
  expect(
    localTimestamp("2026-03-08T10:30:00Z", "America/Los_Angeles"),
  ).toContain("3:30 AM");
  expect(
    localTimestamp("2020-01-01T07:30:00Z", "America/Los_Angeles"),
  ).toContain("Dec 31, 2019");
  expect(localTimestamp("2020-01-01T07:30:00Z", "Asia/Tokyo")).toContain(
    "Jan 1, 2020",
  );
});
it("bounds and validates page cursors while preserving database timestamp precision", () => {
  expect(
    pageCursor(
      "2020-01-01T01:01:01.123456+00:00|12345678-1234-1234-1234-123456789012",
    )?.before,
  ).toContain("123456");
  for (const bad of ["bad", "x|x", "2020-01-01T00:00Z|bad", "x".repeat(151)])
    expect(pageCursor(bad)).toBeNull();
  expect(historyFilter("garbage")).toBe("all");
});
it("preserves exact entered pounds and distinguishes bodyweight from added and external load", () => {
  expect(performanceLabel(set, "lb", "loaded")).toBe("50 lb × 8");
  expect(performanceLabel(set, "kg", "loaded")).toBe("22.68 kg × 8");
  expect(performanceLabel(set, "lb", "bodyweight")).toBe(
    "+50 lb × 8 · Added weight",
  );
  expect(
    performanceLabel(
      {
        ...set,
        load_mode: "bodyweight",
        actual_weight_kg: null,
        entered_weight: null,
        entered_unit: null,
      },
      "lb",
      "bodyweight",
    ),
  ).toBe("8 reps · Bodyweight");
});
it("never presents pending suggestions or unsupported measurements as performed work", () => {
  expect(
    performanceLabel(
      {
        ...set,
        status: "pending",
        inputs_confirmed: false,
        is_automatic: true,
        actual_reps: null,
        actual_weight_kg: null,
        prescribed_reps_min: 8,
        prescribed_weight_kg: 22.68,
      },
      "lb",
      "loaded",
    ),
  ).toBe("Pending · Suggested 50 lb × 8");
  expect(performanceLabel(set, "lb", "assisted")).toContain("needs review");
  expect(performanceLabel(set, "lb", "duration")).toContain("needs review");
});
