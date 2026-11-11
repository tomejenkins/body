import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.create }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { changeGroup } from "./actions";
import type { GroupCommand } from "./model";
const id = "12345678-1234-1234-1234-123456789001",
  other = "12345678-1234-1234-1234-123456789002";
const command: GroupCommand = {
  session: id,
  group: id,
  operation: "create",
  expected: 0,
  request: other,
  members: [
    { type: "movement", id },
    { type: "selection", id: other },
  ],
};
beforeEach(() => vi.resetAllMocks());
it("rejects malformed structural commands before any database access", async () => {
  for (const patch of [
    { session: "wrong" },
    { members: [command.members[0]] },
    { members: [command.members[0], command.members[0]] },
    { expected: -1 },
    { request: "bad" },
  ])
    expect((await changeGroup({ ...command, ...patch })).error).toBeTruthy();
  expect(m.create).not.toHaveBeenCalled();
});
it("verifies identity and invokes the protected command without caller ownership or actual performance", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { groups: [] }, error: null });
  m.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } }, error: null }),
    },
    rpc,
  });
  expect(await changeGroup(command)).toEqual({ groups: [] });
  expect(rpc.mock.calls[0][1]).toEqual({
    p_session: id,
    p_group: id,
    p_operation: "create",
    p_expected: 0,
    p_members: command.members,
    p_request: other,
  });
  rpc.mockResolvedValue({
    error: { code: "40001", message: "private detail" },
  });
  expect(await changeGroup(command)).toMatchObject({ conflict: true });
  rpc.mockRejectedValue(Error("private transport"));
  expect((await changeGroup(command)).error).toContain(
    "could not be confirmed",
  );
});
it("does not treat an empty or unverified response as successful grouping", async () => {
  const rpc = vi.fn();
  m.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc,
  });
  expect((await changeGroup(command)).error).toBeTruthy();
  expect(rpc).not.toHaveBeenCalled();
});
