import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/session", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
import { loadProgramSchedule } from "./queries";
beforeEach(() => vi.resetAllMocks());
it("verifies identity before calendar access", async () => {
  mocks.user.mockRejectedValue(Error("Sign in"));
  await expect(loadProgramSchedule()).rejects.toThrow("Sign in");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("requests one bounded owner-scoped calendar and preference read, never workout sets", async () => {
  mocks.user.mockResolvedValue({ id: "verified" });
  const single = vi
      .fn()
      .mockResolvedValue({ data: { scheduling_timezone: "UTC" } }),
    eq = vi.fn().mockReturnValue({ single }),
    select = vi.fn().mockReturnValue({ eq }),
    from = vi.fn().mockReturnValue({ select }),
    rpc = vi.fn().mockResolvedValue({ data: null });
  mocks.create.mockResolvedValue({ rpc, from });
  expect(await loadProgramSchedule("2026-12-28")).toEqual({
    schedule: null,
    timezone: "UTC",
  });
  expect(rpc).toHaveBeenCalledWith("program_schedule", {
    p_from: "2026-12-28",
    p_days: 7,
  });
  expect(eq).toHaveBeenCalledWith("owner_id", "verified");
  expect(from).toHaveBeenCalledTimes(1);
  await loadProgramSchedule("2026-02-31");
  expect(rpc).toHaveBeenLastCalledWith("program_schedule", {
    p_from: null,
    p_days: 7,
  });
});
it("reports provider failures rather than inventing an empty schedule", async () => {
  mocks.user.mockResolvedValue({ id: "verified" });
  mocks.create.mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({ error: { message: "private" } }),
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: null, error: {} }) }),
      }),
    }),
  });
  await expect(loadProgramSchedule()).rejects.toThrow("could not be loaded");
});
