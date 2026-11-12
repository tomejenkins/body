import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn(), user: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
vi.mock("@/features/auth/session", () => ({ requireUser: mock.user }));
import { loadHistory, loadExerciseHistory } from "./queries";
function timingQuery() {
  const query = {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  query.select.mockReturnValue(query);
  query.in.mockReturnValue(query);
  return vi.fn().mockReturnValue(query);
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ id: "verified" });
});
it("verifies identity before either history read", async () => {
  mock.user.mockRejectedValue(new Error("Sign in required"));
  await expect(loadHistory("all", null)).rejects.toThrow("Sign in");
  await expect(loadExerciseHistory("id", null)).rejects.toThrow("Sign in");
  expect(mock.create).not.toHaveBeenCalled();
});
it("reports unavailable history rather than fabricating an empty account", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValue({ error: { message: "Private provider detail" } });
  mock.create.mockResolvedValue({ rpc, from: timingQuery() });
  await expect(loadHistory("all", null)).rejects.toThrow(
    "could not be confirmed",
  );
  await expect(loadHistory("all", null)).rejects.not.toThrow(
    "Private provider detail",
  );
});
it("requests a bounded page with a lookahead and returns an older-page signal", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: Array.from({ length: 21 }, (_, i) => ({ id: String(i) })),
    error: null,
  });
  mock.create.mockResolvedValue({ rpc, from: timingQuery() });
  const result = await loadHistory("completed", null);
  expect(result.rows).toHaveLength(20);
  expect(result.hasMore).toBe(true);
  expect(rpc).toHaveBeenCalledTimes(3);
  expect(rpc.mock.calls[1]).toEqual([
    "workout_history",
    { p_filter: "completed", p_before: null, p_before_id: null, p_limit: 21 },
  ]);
});
it("loads recognition counts once for the bounded page, never per workout", async () => {
  const rows = [
    { id: "a", recognition_enabled: true },
    { id: "b", recognition_enabled: true },
  ];
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: rows, error: null })
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: { a: 2, b: 1 }, error: null });
  mock.create.mockResolvedValue({ rpc, from: timingQuery() });
  const result = await loadHistory("all", null);
  expect(result.rows.map((w) => w.achievement_count)).toEqual([2, 1]);
  expect(rpc.mock.calls[3]).toEqual([
    "history_achievement_counts",
    { p_sessions: ["a", "b"] },
  ]);
});
it("reports a failed history fetch after successful continuity instead of empty history", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ error: { message: "provider detail" } });
  mock.create.mockResolvedValue({ rpc, from: timingQuery() });
  await expect(loadHistory("all", null)).rejects.toThrow("could not be loaded");
});

it("loads pause intervals once with a bounded session list and verified owner", async () => {
  const from = timingQuery();
  const query = from();
  const pauses = [{ from: "2026-11-01T08:15:00Z", to: "2026-11-01T08:45:00Z" }];
  query.eq.mockResolvedValue({
    data: [{ id: "a", manual_pause_intervals: pauses }],
    error: null,
  });
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: [{ id: "a" }, { id: "b" }], error: null })
    .mockResolvedValueOnce({ data: [], error: null });
  mock.create.mockResolvedValue({ rpc, from });
  const result = await loadHistory("all", null);
  expect(from).toHaveBeenLastCalledWith("workout_sessions");
  expect(query.select).toHaveBeenCalledWith(
    "id,manual_pause_intervals,source_program_version_id",
  );
  expect(query.in).toHaveBeenCalledWith("id", ["a", "b"]);
  expect(query.eq).toHaveBeenCalledWith("owner_id", "verified");
  expect(result.rows.map((r) => r.manual_pause_intervals)).toEqual([
    pauses,
    [],
  ]);
});
it("reports a pause-interval read failure rather than displaying unadjusted timing", async () => {
  const from = timingQuery();
  from().eq.mockResolvedValue({
    data: [],
    error: { message: "private detail" },
  });
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: [{ id: "a" }], error: null })
    .mockResolvedValueOnce({ data: [], error: null });
  mock.create.mockResolvedValue({ rpc, from });
  await expect(loadHistory("all", null)).rejects.toThrow(
    "Workout timing could not be loaded",
  );
});

it("loads one bounded cardio summary and preserves actual duration without lifetime set reads", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: [{ id: "a" }, { id: "b" }], error: null })
    .mockResolvedValueOnce({
      data: [{ session_id: "a", cardio_items: 1, cardio_seconds: 1200 }],
      error: null,
    });
  mock.create.mockResolvedValue({ rpc, from: timingQuery() });
  const result = await loadHistory("all", null);
  expect(rpc.mock.calls[2]).toEqual([
    "workout_cardio_summary",
    { p_sessions: ["a", "b"] },
  ]);
  expect(result.rows[0].cardio_seconds).toBe(1200);
  expect(result.rows[1].cardio_seconds).toBe(0);
});
