import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
import { mutateSet, readSetRows, saveWeightUnit } from "./actions";
import type { SetCommand } from "./model";
const uuid = "12345678-1234-1234-1234-123456789012";
const command: SetCommand = {
  itemId: uuid,
  id: uuid,
  mutation: uuid,
  operation: "add",
  revision: 0,
  reps: null,
  weight: null,
  type: "working",
  mode: "external",
  completed: false,
};
beforeEach(() => vi.resetAllMocks());
it("rejects malformed set writes and preferences before database access", async () => {
  for (const patch of [
    { id: "bad" },
    { reps: -1 },
    { weight: "NaN" },
    { revision: -1, operation: "save" as const },
  ])
    expect((await mutateSet({ ...command, ...patch })).error).toBeTruthy();
  expect((await saveWeightUnit("invalid" as "kg")).error).toBeTruthy();
  expect(mock.create).not.toHaveBeenCalled();
});
it("requires verified identity for every read and write", async () => {
  const rpc = vi.fn();
  const from = vi.fn();
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc,
    from,
  });
  expect((await mutateSet(command)).error).toBeTruthy();
  expect((await readSetRows(uuid)).error).toBeTruthy();
  expect((await saveWeightUnit("lb")).error).toBeTruthy();
  expect(rpc).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});
it("uses invoker RPC without an owner argument and hides provider errors", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } }, error: null }),
    },
    rpc,
  });
  expect(await mutateSet(command)).toEqual({ rows: [] });
  expect(rpc.mock.calls[0][0]).toBe("log_workout_set");
  expect(rpc.mock.calls[0][1]).not.toHaveProperty("owner_id");
  rpc.mockResolvedValue({ error: { message: "private backend detail" } });
  expect((await mutateSet(command)).error).not.toContain(
    "private backend detail",
  );
  rpc.mockRejectedValue(new Error("private network detail"));
  expect((await mutateSet(command)).error).toContain("draft is retained");
});
