import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  require: vi.fn(),
  create: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/session", () => ({ requireUser: m.require }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.create }));
import { loadEnrollment, loadEnrollmentHistory } from "./enrollment-queries";
const id = "12345678-1234-1234-1234-123456789012";
beforeEach(() => {
  vi.resetAllMocks();
  m.require.mockResolvedValue({ id: "verified" });
  m.create.mockResolvedValue({ rpc: m.rpc });
});
it("rejects malformed detail identifiers before data access", async () => {
  expect(await loadEnrollment("bad", null)).toBeNull();
  expect(m.create).not.toHaveBeenCalled();
});
it("does not fetch workouts when owner-scoped enrollment detail is absent", async () => {
  m.rpc.mockResolvedValue({ data: [] });
  expect(await loadEnrollment(id, null)).toBeNull();
  expect(m.require).toHaveBeenCalledWith(`/history/programs/${id}`);
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("bounds both list and associated-workout reads and sends no caller owner", async () => {
  m.rpc.mockResolvedValueOnce({
    data: Array.from({ length: 11 }, (_, i) => ({ id: String(i) })),
  });
  const page = await loadEnrollmentHistory(null);
  expect(page.items).toHaveLength(10);
  expect(page.hasMore).toBe(true);
  expect(m.rpc).toHaveBeenLastCalledWith("program_enrollment_history", {
    p_before: null,
    p_before_id: null,
    p_limit: 11,
  });
  m.rpc.mockResolvedValueOnce({ data: [{ id }] }).mockResolvedValueOnce({
    data: Array.from({ length: 21 }, (_, i) => ({ id: String(i) })),
  });
  const detail = await loadEnrollment(id, null);
  expect(detail?.workouts).toHaveLength(20);
  expect(detail?.hasMore).toBe(true);
  expect(m.rpc).toHaveBeenLastCalledWith("program_history_workouts", {
    p_assignment: id,
    p_before: null,
    p_before_id: null,
    p_limit: 21,
  });
});
it("propagates failed reads instead of rendering misleading zero statistics", async () => {
  m.rpc.mockResolvedValue({ error: { message: "unavailable" } });
  await expect(loadEnrollmentHistory(null)).rejects.toThrow(
    "could not be loaded",
  );
});
