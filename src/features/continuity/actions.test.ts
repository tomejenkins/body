import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
import {
  readWorkoutContinuity,
  continueWorkout,
  finishCheckIn,
} from "./actions";
const id = "12345678-1234-1234-1234-123456789012";
beforeEach(() => vi.resetAllMocks());
it("validates identifiers before database access", async () => {
  expect((await readWorkoutContinuity("bad")).error).toBeTruthy();
  expect((await continueWorkout(id, "bad")).error).toBeTruthy();
  expect((await finishCheckIn("bad", "completed")).error).toBeTruthy();
  expect(mock.create).not.toHaveBeenCalled();
});
it("requires verified identity for passive reads, resume and close", async () => {
  const rpc = vi.fn();
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc,
  });
  for (const result of [
    await readWorkoutContinuity(),
    await continueWorkout(id, id),
    await finishCheckIn(id, "completed"),
  ])
    expect(result.error).toBeTruthy();
  expect(rpc).not.toHaveBeenCalled();
});
it("never passes a client clock or owner to authoritative continuation", async () => {
  const data = { id, status: "in_progress", state: "active" };
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } }, error: null }),
    },
    rpc,
  });
  expect(await continueWorkout(id, id)).toEqual({ data });
  expect(rpc).toHaveBeenCalledWith("workout_continuity", {
    p_session: id,
    p_resume_nonce: id,
  });
});
it("reports expiration as closed rather than pretending resume succeeded", async () => {
  const data = { id, status: "abandoned", state: "expired" };
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  });
  const result = await continueWorkout(id, id);
  expect(result.data).toEqual(data);
  expect(result.error).toContain("closed");
});
it("re-reads actual outcome after a committed expiration sentinel", async () => {
  const data = { id, status: "abandoned", state: "expired" };
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data, error: null });
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } }, error: null }),
    },
    rpc,
  });
  expect(await finishCheckIn(id, "completed")).toEqual({ data });
  expect(rpc.mock.calls).toEqual([
    ["end_workout", { p_session: id, p_outcome: "completed" }],
    ["workout_continuity", { p_session: id }],
  ]);
});
it("hides provider failures and never reports missing data as resumed", async () => {
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: { message: "private provider detail" },
    }),
  });
  const result = await readWorkoutContinuity(id);
  expect(result.error).toBeTruthy();
  expect(result.error).not.toContain("private provider detail");
});
