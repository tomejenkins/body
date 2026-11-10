import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  create: vi.fn(),
  invalidate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.create }));
vi.mock("next/cache", () => ({ revalidatePath: m.invalidate }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
import { changeWorkoutRetention } from "./actions";
const id = "12345678-1234-1234-1234-123456789012",
  rpc = vi.fn(),
  getUser = vi.fn();
function form(kind = "archive") {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    kind,
    session: id,
    request: id,
    revision: "2",
    confirmed: "yes",
  }))
    f.set(k, v);
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "verified" } } });
  rpc.mockResolvedValue({ data: { sessionId: id, kind: "archive" } });
  m.create.mockResolvedValue({ auth: { getUser }, rpc });
});
it("requires explicit confirmation and validated identities/revision", async () => {
  const f = form();
  f.delete("confirmed");
  expect((await changeWorkoutRetention({}, f)).error).toBeTruthy();
  f.set("confirmed", "yes");
  f.set("revision", "-1");
  expect((await changeWorkoutRetention({}, f)).error).toBeTruthy();
  expect(m.create).not.toHaveBeenCalled();
});
it("authorizes verified user and sends only exact command inputs", async () => {
  await changeWorkoutRetention({}, form());
  expect(getUser).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith("retain_workout", {
    p_session: id,
    p_kind: "archive",
    p_request: id,
    p_expected: 2,
  });
  expect(m.invalidate.mock.calls).toEqual(
    [
      "/history",
      "/exercises",
      "/dashboard",
      "/programs",
      "/workout",
      "/profile",
    ].map((p) => [p, "layout"]),
  );
  expect(m.redirect).toHaveBeenCalledWith(`/history/${id}`);
});
it("retains uncertain request identity and rejects stale or unverified changes", async () => {
  rpc.mockResolvedValue({ error: { code: "40001" } });
  expect((await changeWorkoutRetention({}, form())).error).toContain(
    "another device",
  );
  rpc.mockRejectedValue(Error("network"));
  expect((await changeWorkoutRetention({}, form())).error).toContain(
    "same request",
  );
  getUser.mockResolvedValue({ data: { user: null } });
  expect((await changeWorkoutRetention({}, form())).error).toContain("Sign in");
  expect(m.invalidate).not.toHaveBeenCalled();
  expect(m.redirect).not.toHaveBeenCalled();
});
it("deletion navigates away from a removed detail only after confirmed success", async () => {
  rpc.mockResolvedValue({ data: { sessionId: id, kind: "delete" } });
  await changeWorkoutRetention({}, form("delete"));
  expect(m.redirect).toHaveBeenCalledWith("/history?message=deleted");
});
