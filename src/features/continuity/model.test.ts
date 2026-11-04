import { expect, it } from "vitest";
import {
  recoveredDuration,
  qualifiedDuration,
  closureExplanation,
  type Continuity,
} from "./model";
const workout: Continuity = {
  id: "id",
  status: "completed",
  state: "closed",
  server_now: "2026-11-01T10:00:00Z",
  started_at: "2026-11-01T08:00:00Z",
  last_activity_at: "2026-11-01T09:00:00Z",
  activity_evidence_at: "2026-11-01T09:00:00Z",
  finished_at: "2026-11-01T10:00:00Z",
  effective_finished_at: "2026-11-01T09:00:00Z",
  duration_kind: "estimated",
  closure_reason: "finished",
  idle_intervals: [],
  completed: 1,
  total: 3,
  continuation_count: 0,
};
it("uses historical endpoint across DST instead of administrative closure or client timezone", () => {
  expect(recoveredDuration(workout)).toBe("1 hr 0 min");
  expect(qualifiedDuration(workout)).toBe(
    "Estimated workout duration: 1 hr 0 min",
  );
});
it("does not invent duration when no activity exists", () => {
  expect(
    recoveredDuration({ ...workout, activity_evidence_at: null }),
  ).toBeNull();
  expect(
    qualifiedDuration({
      ...workout,
      effective_finished_at: null,
      duration_kind: "unknown",
    }),
  ).toBe("Duration unavailable");
});
it("distinguishes resumed elapsed gaps from exercise time and preserves legacy duration", () => {
  expect(
    qualifiedDuration({
      ...workout,
      duration_kind: "elapsed",
      effective_finished_at: workout.finished_at,
      idle_intervals: [
        { from: workout.last_activity_at, to: workout.finished_at! },
      ],
    }),
  ).toBe("Elapsed session: 2 hr 0 min · Includes an inactive interval");
  expect(qualifiedDuration({ ...workout, duration_kind: "legacy" })).toBe(
    "Elapsed session (legacy): 2 hr 0 min",
  );
});
it("explains automatic closure and retained performance", () => {
  expect(closureExplanation("inactivity")).toContain("12 hours");
  expect(closureExplanation("inactivity")).toContain("pending sets were kept");
  expect(closureExplanation("finished")).toBe("");
});
