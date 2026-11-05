import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
import { snapshotOwnProgram, cloneOwnVersion } from "./repository";
const id = "12345678-1234-1234-1234-123456789012";
beforeEach(() => vi.resetAllMocks());
it("validates version/program/request IDs before private access", async () => {
  await expect(snapshotOwnProgram("bad")).rejects.toThrow("Invalid");
  await expect(cloneOwnVersion(id, " ", id)).rejects.toThrow("Invalid");
  await expect(cloneOwnVersion(id, "Copy", "bad")).rejects.toThrow("Invalid");
  expect(mock.create).not.toHaveBeenCalled();
});
it("requires verified identity before snapshot or cloning", async () => {
  const rpc = vi.fn();
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc,
  });
  await expect(snapshotOwnProgram(id)).rejects.toThrow("Sign in");
  await expect(cloneOwnVersion(id, "Copy", id)).rejects.toThrow("Sign in");
  expect(rpc).not.toHaveBeenCalled();
});
it("uses the verified invoker with no submitted owner/publisher", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: id, error: null });
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } }, error: null }),
    },
    rpc,
  });
  expect(await cloneOwnVersion(id, " Copy ", id)).toBe(id);
  expect(rpc).toHaveBeenCalledWith("clone_program", {
    p_version: id,
    p_name: "Copy",
    p_request: id,
  });
});
