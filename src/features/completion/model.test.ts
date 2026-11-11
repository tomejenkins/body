import { expect, it } from "vitest";
import { completionDuration, favoriteSource } from "./model";
import type { Workout } from "@/features/workouts/types";
import type { Continuity } from "@/features/continuity/model";
const w: Workout = {
  id: "session",
  name: "Workout",
  userId: "owner",
  status: "completed",
  completionStatus: "partial",
  startedAt: "2026-11-09T10:00:00Z",
  finishedAt: "2026-11-09T11:00:00Z",
  items: [],
  weightUnit: "kg",
};
const c: Continuity = {
  id: w.id,
  status: "completed",
  state: "closed",
  server_now: w.finishedAt!,
  started_at: w.startedAt,
  last_activity_at: w.finishedAt,
  activity_evidence_at: w.finishedAt,
  finished_at: w.finishedAt,
  effective_finished_at: w.finishedAt,
  duration_kind: "elapsed",
  closure_reason: "finished",
  idle_intervals: [],
  completed: 1,
  total: 3,
  continuation_count: 0,
};
it("uses existing qualified manual-pause duration and visibly separates legacy/estimated/unknown", () => {
  expect(
    completionDuration({
      ...w,
      continuity: {
        ...c,
        manual_pause_intervals: [
          { from: "2026-11-09T10:10:00Z", to: "2026-11-09T10:30:00Z" },
        ],
      },
    }),
  ).toMatchObject({ label: "Effective session", value: "40 min" });
  expect(completionDuration(w).label).toContain("legacy");
  expect(
    completionDuration({
      ...w,
      continuity: {
        ...c,
        duration_kind: "estimated",
        effective_finished_at: "2026-11-09T10:20:00Z",
      },
    }),
  ).toMatchObject({ label: "Estimated workout duration", value: "20 min" });
  expect(
    completionDuration({
      ...w,
      continuity: {
        ...c,
        duration_kind: "unknown",
        effective_finished_at: null,
      },
    }).value,
  ).toBe("Unavailable");
});
it("maps real program-day or independent-session source without inventing assignment execution", () => {
  expect(favoriteSource(w)).toEqual({
    type: "completed_ad_hoc",
    source: "session",
    key: "session",
  });
  expect(
    favoriteSource({ ...w, sourceVersionId: "version", sourceDayId: "day" }),
  ).toEqual({
    type: "program_day",
    source: "version",
    day: "day",
    key: "version:day",
  });
});

it("saves the final actual grouping of a program workout as an independent completed-workout structure", () => {
  expect(
    favoriteSource({
      ...w,
      sourceVersionId: "version",
      sourceDayId: "day",
      hasGroupHistory: true,
    }),
  ).toEqual({ type: "completed_workout", source: w.id, key: w.id });
});

it("keeps original Favorite attribution unless its grouping was edited", () => {
  expect(
    favoriteSource({
      ...w,
      hasGroupHistory: true,
      favoriteGroupingEdited: true,
    }),
  ).toEqual({ type: "completed_ad_hoc", source: w.id, key: w.id });
  expect(
    favoriteSource({
      ...w,
      hasGroupHistory: true,
      favoriteId: "favorite",
      favoriteGroupingEdited: true,
    }),
  ).toEqual({ type: "completed_workout", source: w.id, key: w.id });
});
