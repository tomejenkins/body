import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { configureSchedule } from "./actions";
const id = "12345678-1234-1234-1234-123456789012";
function form() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    assignment: id,
    request: id,
    timezone: "Europe/London",
    start: "2026-11-06",
    confirmed: "yes",
  }))
    f.set(k, v);
  return f;
}
beforeEach(() => vi.resetAllMocks());
it("requires explicit confirmation, real dates and valid identity selectors before database access", async () => {
  const f = form();
  f.delete("confirmed");
  expect((await configureSchedule({}, f)).error).toBeTruthy();
  f.set("confirmed", "yes");
  f.set("start", "2026-02-31");
  expect((await configureSchedule({}, f)).error).toBeTruthy();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("requires verified user identity and never sends a caller owner to configuration", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: {} });
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "verified" } } }),
  };
  mocks.create.mockResolvedValue({ auth, rpc });
  expect(await configureSchedule({}, form())).toEqual({ saved: true });
  expect(rpc.mock.calls[1]).toEqual([
    "configure_program_schedule",
    {
      p_assignment: id,
      p_start: "2026-11-06",
      p_timezone: "Europe/London",
      p_request: id,
    },
  ]);
  expect(mocks.revalidate).toHaveBeenCalledWith("/programs");
  auth.getUser.mockResolvedValue({ data: { user: null } });
  expect((await configureSchedule({}, form())).error).toContain("Sign in");
  expect(rpc).toHaveBeenCalledTimes(2);
});
it("reports invalid zones and uncertain network outcomes without claiming configuration", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: false });
  mocks.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } } }),
    },
    rpc,
  });
  expect((await configureSchedule({}, form())).error).toContain("IANA");
  rpc.mockRejectedValue(Error("transport"));
  expect((await configureSchedule({}, form())).error).toContain("same request");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("persists a default only to the verified owner and does not report a zero-row write as saved", async () => {
  const single = vi.fn().mockResolvedValue({ data: null, error: null });
  const select = vi.fn().mockReturnValue({ maybeSingle: single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  mocks.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } } }),
    },
    rpc: vi.fn().mockResolvedValue({ data: true }),
    from: vi.fn().mockReturnValue({ update }),
  });
  const input = form();
  input.delete("assignment");
  expect((await configureSchedule({}, input)).error).toBeTruthy();
  expect(eq).toHaveBeenCalledWith("owner_id", "verified");
  expect(mocks.revalidate).not.toHaveBeenCalled();
  single.mockResolvedValue({ data: { owner_id: "verified" }, error: null });
  expect(await configureSchedule({}, input)).toEqual({ saved: true });
});
