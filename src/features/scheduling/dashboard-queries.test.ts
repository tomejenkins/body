import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/session", () => ({ requireUser: m.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
import { loadTrainingWeek } from "./dashboard-queries";
beforeEach(() => vi.resetAllMocks());
it("verifies the owner before reading a private calendar", async () => {
  m.user.mockRejectedValue(Error("Sign in"));
  await expect(loadTrainingWeek()).rejects.toThrow("Sign in");
  expect(m.client).not.toHaveBeenCalled();
});
it("requests one bounded schedule with no library/history query for missing configuration", async () => {
  m.user.mockResolvedValue({ id: "owner" });
  const rpc = vi.fn().mockResolvedValue({
      data: { assignmentId: "a", configured: false, state: "active" },
    }),
    from = vi.fn();
  m.client.mockResolvedValue({ rpc, from });
  expect((await loadTrainingWeek("2027-01-01")).schedule?.configured).toBe(
    false,
  );
  expect(rpc).toHaveBeenCalledWith("program_schedule", {
    p_from: "2026-12-28",
    p_days: 7,
  });
  expect(from).not.toHaveBeenCalled();
});
it("reads one owner-filtered padded weekly summary query with an explicit cap, never working sets", async () => {
  m.user.mockResolvedValue({ id: "verified" });
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    returns: vi.fn().mockResolvedValue({ data: [] }),
  };
  for (const fn of [q.select, q.eq, q.in, q.or, q.gte, q.lt, q.order, q.limit])
    fn.mockReturnValue(q);
  const rpc = vi.fn().mockResolvedValue({
      data: {
        assignmentId: "a",
        configured: true,
        state: "active",
        timezone: "America/New_York",
        from: "2026-03-02",
        until: "2026-03-09",
        today: "2026-03-08",
        events: [],
      },
    }),
    from = vi.fn().mockReturnValue(q);
  m.client.mockResolvedValue({ rpc, from });
  await loadTrainingWeek();
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(from).toHaveBeenCalledWith("workout_sessions");
  expect(q.eq).toHaveBeenCalledWith("owner_id", "verified");
  expect(q.gte).toHaveBeenCalledWith("finished_at", "2026-03-01T00:00:00Z");
  expect(q.lt).toHaveBeenCalledWith("finished_at", "2026-03-10T00:00:00Z");
  expect(q.limit).toHaveBeenCalledWith(201);
  expect(q.or).toHaveBeenCalledWith(
    "program_assignment_id.is.null,program_assignment_id.neq.a",
  );
});
it("reports provider failure rather than inventing an empty plan", async () => {
  m.user.mockResolvedValue({ id: "owner" });
  m.client.mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({ error: { message: "private" } }),
  });
  await expect(loadTrainingWeek()).rejects.toThrow("could not be loaded");
});
