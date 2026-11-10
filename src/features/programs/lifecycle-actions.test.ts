import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  create: vi.fn(),
  invalidate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.create }));
vi.mock("next/cache", () => ({ revalidatePath: m.invalidate }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
import { changeProgram } from "./lifecycle-actions";
const id = "12345678-1234-1234-1234-123456789012";
function form(kind = "start") {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    kind,
    request: id,
    version: id,
    revision: "0",
    timezone: "Europe/London",
    start: "2026-11-10",
    confirmed: "yes",
  }))
    f.set(k, v);
  return f;
}
const rpc = vi.fn(),
  getUser = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "verified" } } });
  rpc.mockResolvedValue({ data: { assignmentId: id } });
  m.create.mockResolvedValue({ auth: { getUser }, rpc });
});
it("rejects malformed commands and requires scheduling and destructive confirmation", async () => {
  const f = form();
  f.delete("confirmed");
  expect((await changeProgram({}, f)).error).toBeTruthy();
  f.set("confirmed", "yes");
  f.set("start", "2026-02-31");
  expect((await changeProgram({}, f)).error).toBeTruthy();
  expect((await changeProgram({}, form("switch"))).error).toContain("Confirm");
  expect(m.create).not.toHaveBeenCalled();
});
it("verifies identity, sends exact command payload without caller owner, and invalidates all program surfaces", async () => {
  await changeProgram({}, form());
  expect(getUser).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith("program_lifecycle", {
    p_kind: "start",
    p_request: id,
    p_assignment: null,
    p_expected: 0,
    p_version: id,
    p_start: "2026-11-10",
    p_timezone: "Europe/London",
  });
  expect(m.invalidate.mock.calls).toEqual(
    ["/dashboard", "/programs", "/workout", "/history"].map((p) => [
      p,
      "layout",
    ]),
  );
  expect(m.redirect).toHaveBeenCalledWith("/programs/current");
});
it("does not claim success for stale or uncertain outcomes and preserves retry identity", async () => {
  rpc.mockResolvedValue({ error: { code: "40001" } });
  expect((await changeProgram({}, form())).error).toContain("another device");
  rpc.mockRejectedValue(Error("network"));
  expect((await changeProgram({}, form())).error).toContain("same request");
  expect(m.invalidate).not.toHaveBeenCalled();
  expect(m.redirect).not.toHaveBeenCalled();
});
it("denies unverified identity and returns ended enrollment to its history", async () => {
  getUser.mockResolvedValueOnce({ data: { user: null } });
  expect((await changeProgram({}, form())).error).toContain("Sign in");
  expect(rpc).not.toHaveBeenCalled();
  const f = form("end_now");
  f.set("assignment", id);
  f.set("confirm_transition", "yes");
  await changeProgram({}, f);
  expect(rpc.mock.calls[0][1].p_version).toBeNull();
  expect(m.redirect).toHaveBeenCalledWith(`/history/programs/${id}`);
});
