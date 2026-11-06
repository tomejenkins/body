import { expect, it } from "vitest";
import {
  secondsExcludingPauses,
  timerLabel,
  timerRunning,
  newerTimerState,
} from "./timer";
import type { Continuity } from "./model";
it("subtracts clipped nonoverlapping pause time without changing legacy elapsed duration", () => {
  const start = "2026-11-06T10:00:00Z",
    end = "2026-11-06T11:00:00Z";
  expect(secondsExcludingPauses(start, end)).toBe(3600);
  expect(
    secondsExcludingPauses(start, end, [
      { from: "2026-11-06T10:10:00Z", to: "2026-11-06T10:20:00Z" },
      { from: "2026-11-06T10:40:00Z", to: "2026-11-06T12:00:00Z" },
    ]),
  ).toBe(1800);
  expect(
    secondsExcludingPauses(start, end, [
      { from: "2026-11-06T09:00:00Z", to: "2026-11-06T09:30:00Z" },
    ]),
  ).toBe(3600);
  expect(secondsExcludingPauses(start, null)).toBeNull();
  expect(secondsExcludingPauses(end, start)).toBeNull();
});
it("does not double count overlapping imported intervals", () =>
  expect(
    secondsExcludingPauses("2026-11-06T10:00:00Z", "2026-11-06T11:00:00Z", [
      { from: "2026-11-06T10:10:00Z", to: "2026-11-06T10:30:00Z" },
      { from: "2026-11-06T10:20:00Z", to: "2026-11-06T10:40:00Z" },
    ]),
  ).toBe(1800));
it("formats seconds, hours and unavailable state without an independent clock", () => {
  expect(timerLabel(1965)).toBe("32:45");
  expect(timerLabel(3605)).toBe("1:00:05");
  expect(timerLabel(null)).toBe("--:--");
  expect(timerLabel(-1)).toBe("00:00");
  const data = { status: "in_progress", manual_paused_at: null } as Continuity;
  expect(timerRunning(data)).toBe(true);
  expect(timerRunning({ ...data, manual_paused_at: "now" })).toBe(false);
  expect(timerRunning({ ...data, status: "completed" })).toBe(false);
});

it("rejects stale timer responses and never reopens a closed session", () => {
  const data = {
    id: "session",
    status: "in_progress",
    timer_revision: 2,
    server_now: "2026-11-06T10:00:00.100Z",
  } as Continuity;
  expect(
    newerTimerState(
      { ...data, timer_revision: 1, server_now: "2026-11-06T11:00:00Z" },
      data,
    ),
  ).toBe(false);
  expect(
    newerTimerState({ ...data, server_now: "2026-11-06T10:00:00.099Z" }, data),
  ).toBe(false);
  expect(newerTimerState({ ...data, timer_revision: 3 }, data)).toBe(true);
  expect(newerTimerState(data, { ...data, status: "completed" })).toBe(false);
});
it("rejects malformed pause timestamps instead of claiming elapsed time", () => {
  expect(
    secondsExcludingPauses("2026-11-06T10:00:00Z", "2026-11-06T11:00:00Z", [
      { from: "invalid", to: "2026-11-06T10:30:00Z" },
    ]),
  ).toBeNull();
});
