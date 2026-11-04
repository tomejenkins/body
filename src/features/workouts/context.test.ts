import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn(), user: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
vi.mock("@/features/auth/session", () => ({ requireUser: mock.user }));
import { loadWorkoutContext } from "./context";
const id = "12345678-1234-1234-1234-123456789012";
function chain(data: unknown, error: unknown = null) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  for (const fn of [q.select, q.eq, q.is, q.limit]) fn.mockReturnValue(q);
  return q;
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ id: "verified-owner" });
});
it("rejects malformed context before accessing private data", async () => {
  expect(await loadWorkoutContext("bad", id)).toBeNull();
  expect(await loadWorkoutContext([id], id)).toBeNull();
  expect(mock.create).not.toHaveBeenCalled();
});
it("requires verified auth and explicitly scopes both lookups to that owner", async () => {
  const parent = chain({ id, status: "in_progress" }),
    selected = chain({ id: "selected" });
  const from = vi
    .fn()
    .mockReturnValueOnce(parent)
    .mockReturnValueOnce(selected);
  mock.create.mockResolvedValue({ from });
  expect(await loadWorkoutContext(id, id)).toEqual({
    id,
    status: "in_progress",
    alreadyAdded: true,
  });
  expect(mock.user).toHaveBeenCalled();
  expect(parent.eq).toHaveBeenCalledWith("owner_id", "verified-owner");
  expect(selected.eq).toHaveBeenCalledWith("owner_id", "verified-owner");
  expect(selected.is).toHaveBeenCalledWith("removed_at", null);
});
it("never exposes controls for unavailable or closed workouts", async () => {
  for (const status of ["completed", "abandoned"]) {
    const from = vi.fn().mockReturnValue(chain({ id, status }));
    mock.create.mockResolvedValue({ from });
    expect(await loadWorkoutContext(id, id)).toEqual({
      id,
      status,
      alreadyAdded: false,
    });
    expect(from).toHaveBeenCalledTimes(1);
  }
  mock.create.mockResolvedValue({ from: vi.fn().mockReturnValue(chain(null)) });
  expect(await loadWorkoutContext(id, id)).toBeNull();
});
it("fails closed on auth or data failures", async () => {
  mock.user.mockRejectedValueOnce(new Error("Sign in required"));
  await expect(loadWorkoutContext(id, id)).rejects.toThrow("Sign in");
  expect(mock.create).not.toHaveBeenCalled();
  mock.create.mockResolvedValue({
    from: vi.fn().mockReturnValue(chain(null, { message: "Private failure" })),
  });
  await expect(loadWorkoutContext(id, id)).rejects.toThrow(
    "could not be loaded",
  );
});
