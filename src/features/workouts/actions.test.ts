import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  create: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
import { startWorkout, editWorkout, endWorkout } from "./actions";
const uuid = "12345678-1234-1234-1234-123456789012";
const verified = (rpc = vi.fn()) => ({
  auth: {
    getUser: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: "verified" } }, error: null }),
  },
  rpc,
});
beforeEach(() => vi.resetAllMocks());
it("refuses writes without verified identity", async () => {
  const rpc = vi.fn();
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: {} }),
    },
    rpc,
  });
  expect((await startWorkout()).error).toBeTruthy();
  expect(rpc).not.toHaveBeenCalled();
});
it("resumes the ID returned by the atomic start RPC instead of inventing another session", async () => {
  mock.redirect.mockImplementation((url) => {
    throw new Error(`redirect:${url}`);
  });
  const rpc = vi.fn().mockResolvedValue({ data: uuid, error: null });
  mock.create.mockResolvedValue(verified(rpc));
  await expect(startWorkout()).rejects.toThrow(`redirect:/workout/${uuid}`);
  expect(rpc).toHaveBeenCalledWith("start_ad_hoc_workout");
});
it("validates selection operations before database access", async () => {
  const data = new FormData();
  data.set("sessionId", uuid);
  data.set("operation", "move");
  data.set("itemId", uuid);
  data.set("direction", "200");
  expect((await editWorkout({}, data)).error).toBeTruthy();
  expect(mock.create).not.toHaveBeenCalled();
});
it("never sends submitted ownership and hides provider details", async () => {
  const data = new FormData();
  data.set("sessionId", uuid);
  data.set("exerciseId", uuid);
  data.set("owner_id", "forged");
  data.set("operation", "add");
  const rpc = vi.fn().mockResolvedValue({ data: uuid, error: null });
  mock.create.mockResolvedValue(verified(rpc));
  expect((await editWorkout({}, data)).success).toBe("Exercise selected.");
  expect(rpc.mock.calls[0][1]).not.toHaveProperty("owner_id");
  rpc.mockResolvedValue({ error: { message: "private failure" } });
  expect((await editWorkout({}, data)).error).not.toContain("private failure");
});
it("rejects arbitrary terminal transitions", async () => {
  const data = new FormData();
  data.set("sessionId", uuid);
  data.set("outcome", "in_progress");
  expect((await endWorkout({}, data)).error).toBeTruthy();
  expect(mock.create).not.toHaveBeenCalled();
});
