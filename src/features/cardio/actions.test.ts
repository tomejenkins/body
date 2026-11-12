import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.create }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { recordCardio } from "./actions";
import type { CardioCommand } from "./model";
const id = "12345678-1234-1234-1234-123456789012",
  c: CardioCommand = {
    session: id,
    item: id,
    request: id,
    operation: "save",
    expected: 1,
    activity: "bike",
    seconds: 1200,
  };
beforeEach(() => vi.resetAllMocks());
it("rejects invalid values before authentication or I/O", async () => {
  expect((await recordCardio({ ...c, seconds: 0 })).error).toBeTruthy();
  expect(m.create).not.toHaveBeenCalled();
});
it("authenticates, scopes canonical RPC inputs, and never invents success on a lost response", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { items: [] } });
  m.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner" } } }),
    },
    rpc,
  });
  expect((await recordCardio(c)).items).toEqual([]);
  expect(rpc).toHaveBeenCalledWith("record_workout_cardio", {
    p_session: id,
    p_item: id,
    p_request: id,
    p_operation: "save",
    p_expected: 1,
    p_activity: "bike",
    p_seconds: 1200,
  });
  rpc.mockRejectedValue(Error("network"));
  expect((await recordCardio(c)).error).toContain("could not be confirmed");
});
it("reports a stale revision without claiming saved duration", async () => {
  m.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner" } } }),
    },
    rpc: vi.fn().mockResolvedValue({ error: { code: "40001" } }),
  });
  expect(await recordCardio(c)).toMatchObject({ conflict: true });
});
