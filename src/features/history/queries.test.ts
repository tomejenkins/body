import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn(), user: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
vi.mock("@/features/auth/session", () => ({ requireUser: mock.user }));
import { loadHistory, loadExerciseHistory } from "./queries";
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
  mock.create.mockResolvedValue({ rpc });
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
  mock.create.mockResolvedValue({ rpc });
  const result = await loadHistory("completed", null);
  expect(result.rows).toHaveLength(20);
  expect(result.hasMore).toBe(true);
  expect(rpc).toHaveBeenCalledTimes(2);
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
    .mockResolvedValueOnce({ data: { a: 2, b: 1 }, error: null });
  mock.create.mockResolvedValue({ rpc });
  const result = await loadHistory("all", null);
  expect(result.rows.map((w) => w.achievement_count)).toEqual([2, 1]);
  expect(rpc.mock.calls[2]).toEqual([
    "history_achievement_counts",
    { p_sessions: ["a", "b"] },
  ]);
});
it("reports a failed history fetch after successful continuity instead of empty history", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ error: { message: "provider detail" } });
  mock.create.mockResolvedValue({ rpc });
  await expect(loadHistory("all", null)).rejects.toThrow("could not be loaded");
});
