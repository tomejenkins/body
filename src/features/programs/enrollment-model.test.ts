import { expect, it } from "vitest";
import {
  enrollmentDuration,
  comparisonChange,
  strengthHighlights,
  sameEnrollmentVersion,
  type Enrollment,
  type StrengthComparison,
} from "./enrollment-model";
const duration = (
  startedAt: string,
  endedAt: string,
  timezone = "UTC",
  provenance: "server" | "legacy" = "server",
) =>
  enrollmentDuration({
    startedAt,
    endedAt,
    asOf: endedAt,
    timezone,
    provenance,
  });
it("uses actual elapsed days/weeks and labels uncertain legacy provenance", () => {
  expect(duration("2026-01-01Z", "2026-01-13Z")).toBe("12 days");
  expect(duration("2026-01-01Z", "2026-02-19Z")).toBe("7 weeks");
  expect(duration("2026-01-01Z", "2026-01-01T12:00Z")).toBe("Less than a day");
  expect(duration("2026-01-01Z", "2026-01-13Z", "UTC", "legacy")).toContain(
    "Legacy",
  );
  expect(duration("2026-01-13Z", "2026-01-01Z")).toBe("Duration unavailable");
});
it("uses calendar anniversaries rather than thirty-day months or fixed years", () => {
  expect(duration("2026-01-31T10:00Z", "2026-05-31T10:00Z")).toBe("4 months");
  expect(duration("2024-02-29T10:00Z", "2025-02-28T10:00Z")).toBe("1 year");
  expect(duration("2024-02-29T10:00Z", "2025-06-10T10:00Z")).toBe(
    "1 year, 3 months",
  );
  expect(duration("2026-01-31T10:00Z", "2026-06-12T10:00Z")).toBe(
    "4 months, 12 days",
  );
});
it("uses a stable enrollment timezone across DST and year boundaries", () => {
  expect(
    duration("2026-01-10T17:00Z", "2026-04-10T16:00Z", "America/New_York"),
  ).toBe("3 months");
  expect(
    duration("2025-10-01T08:00Z", "2026-02-01T09:00Z", "Europe/London"),
  ).toBe("4 months");
});
const comparison = (
  id: string,
  delta: number | null = 10,
  metric: StrengthComparison["metric"] = "actual_rm",
  reps = 5,
) =>
  ({
    exerciseId: id,
    name: id,
    metric,
    category: "loaded",
    reps,
    baseline: {},
    later: delta === null ? null : {},
    delta,
  }) as StrengthComparison;
it("highlights at most two distinct canonical lifts, only positive actual comparable loads", () => {
  const rows = [
    comparison("bench", 10),
    comparison("bench", 12, "actual_rm", 3),
    comparison("squat", 5),
    comparison("row", 0),
    comparison("pull", -5),
    comparison("press", 10, "estimated_1rm"),
    comparison("curl", null),
  ];
  const h = strengthHighlights(rows);
  expect(h).toHaveLength(2);
  expect(h[0].reps).toBe(5);
  expect(new Set(h.map((c) => c.exerciseId)).size).toBe(2);
  expect(h.every((c) => c.metric === "actual_rm" && Number(c.delta) > 0)).toBe(
    true,
  );
});
it("keeps canonical load conversion, negative results and insufficient history explicit", () => {
  expect(comparisonChange(comparison("a", 5), "kg")).toBe("+5 kg at 5 reps");
  expect(comparisonChange(comparison("a", 5), "lb")).toBe(
    "+11.02 lb at 5 reps",
  );
  expect(comparisonChange(comparison("a", -5), "kg")).toContain("−5");
  expect(comparisonChange(comparison("a", 0), "kg")).toBe("No change");
  expect(comparisonChange(comparison("a", null), "kg")).toContain(
    "More comparable",
  );
  expect(comparisonChange(comparison("a", 5, "estimated_1rm"), "kg")).toContain(
    "estimated",
  );
});
it("distinguishes the selected immutable public version from later owned editions", () => {
  const a = {
    versionId: "owned-v2",
    enrollmentVersionId: "owned-v2",
    originalVersionId: "public-v1",
    versionNumber: 2,
  } as Enrollment;
  expect(sameEnrollmentVersion(a, "public-v1")).toBe(false);
  expect(sameEnrollmentVersion(a, "owned-v2")).toBe(true);
  expect(
    sameEnrollmentVersion(
      {
        ...a,
        versionId: "owned-v1",
        enrollmentVersionId: "public-v1",
        versionNumber: 1,
      },
      "public-v1",
    ),
  ).toBe(true);
});
