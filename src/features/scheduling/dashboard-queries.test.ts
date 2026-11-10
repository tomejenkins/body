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
    is: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    returns: vi.fn().mockResolvedValue({ data: [] }),
  };
  for (const fn of [
    q.select,
    q.eq,
    q.is,
    q.in,
    q.or,
    q.gte,
    q.lt,
    q.order,
    q.limit,
  ])
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
  expect(q.is).toHaveBeenCalledWith("archived_at", null);
  expect(q.gte).toHaveBeenCalledWith("finished_at", "2026-03-01T00:00:00Z");
  expect(q.lt).toHaveBeenCalledWith("finished_at", "2026-03-10T00:00:00Z");
  expect(q.limit).toHaveBeenCalledWith(201);
  expect(q.in).not.toHaveBeenCalled();
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
it("reconciles other-program historical full labels using bounded authoritative classification", async () => {
  m.user.mockResolvedValue({ id: "verified" });
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of [
    "select",
    "eq",
    "is",
    "in",
    "or",
    "gte",
    "lt",
    "order",
    "limit",
  ])
    q[key] = vi.fn().mockReturnValue(q);
  q.returns = vi.fn().mockResolvedValue({
    data: [
      {
        id: "partial",
        name: "Restored qualifying evidence",
        finished_at: "2026-03-03T12:00:00Z",
        completion_status: "none",
        program_assignment_id: "older",
      },
      {
        id: "empty",
        name: "Old zero load",
        finished_at: "2026-03-03T12:00:00Z",
        completion_status: "full",
        program_assignment_id: "older",
      },
    ],
  });
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({
      data: {
        assignmentId: "current",
        configured: true,
        timezone: "UTC",
        from: "2026-03-02",
        until: "2026-03-09",
        events: [],
      },
    })
    .mockResolvedValueOnce({
      data: [
        { session_id: "partial", completion_status: "partial" },
        { session_id: "empty", completion_status: "none" },
      ],
    });
  m.client.mockResolvedValue({ rpc, from: vi.fn().mockReturnValue(q) });
  const result = await loadTrainingWeek();
  expect(result.events).toHaveLength(1);
  expect(result.events[0].status).toBe("recorded_partial");
  expect(rpc).toHaveBeenLastCalledWith("workout_program_classifications", {
    p_sessions: ["partial", "empty"],
  });
});
