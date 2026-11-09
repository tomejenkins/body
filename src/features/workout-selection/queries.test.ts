import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/session", () => ({ requireUser: mock.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
import { loadStartOptions } from "./queries";
beforeEach(() => vi.resetAllMocks());
it("requires verified identity before start options", async () => {
  mock.user.mockRejectedValue(Error("Sign in"));
  await expect(loadStartOptions()).rejects.toThrow("Sign in");
  expect(mock.create).not.toHaveBeenCalled();
});
it("uses one bounded server aggregation and reports read failure", async () => {
  mock.user.mockResolvedValue({ id: "verified" });
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({
      data: { assignment: null, favorites: [], activeSession: null },
    })
    .mockResolvedValueOnce({ error: { message: "private" } });
  mock.create.mockResolvedValue({ rpc });
  expect((await loadStartOptions()).favorites).toEqual([]);
  expect(rpc).toHaveBeenCalledWith("workout_start_options");
  await expect(loadStartOptions()).rejects.toThrow("could not be loaded");
});
