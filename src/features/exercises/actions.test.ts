import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveExercise } from "./actions";
const id = "12345678-1234-1234-1234-123456789012";
function form() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    name: "My exercise",
    exerciseType: "isolation",
    primaryPatternId: id,
    primaryMuscleIds: id,
    equipmentIds: id,
    owner_id: "forged",
  }))
    f.set(k, v);
  return f;
}
beforeEach(() => vi.resetAllMocks());
it("refuses account writes without a server-verified user", async () => {
  const rpc = vi.fn();
  mocks.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: {} }),
    },
    rpc,
  });
  expect((await saveExercise({}, form())).error).toBeTruthy();
  expect(rpc).not.toHaveBeenCalled();
});
it("uses the atomic invoker RPC and never passes a submitted owner", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: id, error: null });
  mocks.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } }, error: null }),
    },
    rpc,
  });
  expect(await saveExercise({}, form())).toEqual({
    success: "Exercise saved.",
    id,
  });
  const params = rpc.mock.calls[0][1];
  expect(params.p_type).toBe("isolation");
  expect(params.owner_id).toBeUndefined();
  expect(params.p_owner).toBeUndefined();
});
it("validates before contacting the database and keeps provider errors private", async () => {
  const f = form();
  f.set("exerciseType", "bad");
  expect((await saveExercise({}, f)).error).toContain("Choose compound");
  expect(mocks.create).not.toHaveBeenCalled();
  mocks.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id } }, error: null }),
    },
    rpc: vi
      .fn()
      .mockResolvedValue({ error: { message: "private database error" } }),
  });
  expect((await saveExercise({}, form())).error).not.toContain(
    "private database",
  );
});
