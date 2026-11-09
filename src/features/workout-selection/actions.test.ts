import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  create: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
vi.mock("next/cache", () => ({ revalidatePath: mock.refresh }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
import {
  scheduleDecision,
  saveFavorite,
  startSelection,
  manageFavorite,
} from "./actions";
const id = "12345678-1234-1234-1234-123456789012";
function form(extra: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    assignment: id,
    version: id,
    day: id,
    request: id,
    expected: "0",
    revision: "0",
    rotation: "0",
    confirmed: "yes",
    ...extra,
  }))
    f.set(k, v);
  return f;
}
beforeEach(() => vi.resetAllMocks());
it("validates typed intent and confirmation before accessing private data", async () => {
  const f = form({ kind: "skip" });
  f.delete("confirmed");
  expect((await scheduleDecision({}, f)).error).toBeTruthy();
  expect(
    (await scheduleDecision({}, form({ kind: "defer", date: "2026-02-31" })))
      .error,
  ).toBeTruthy();
  expect(
    (await scheduleDecision({}, form({ kind: "accept_partial" }))).error,
  ).toBeTruthy();
  expect(
    (await saveFavorite({}, form({ sourceType: "program_day", name: "Name" })))
      .error,
  ).toBeTruthy();
  expect(
    (
      await manageFavorite(
        {},
        form({ favorite: id, operation: "remove", confirmed: "no" }),
      )
    ).error,
  ).toBeTruthy();
  expect(mock.create).not.toHaveBeenCalled();
});
it("verifies identity and sends exact occurrence/revision without caller owner or completion claims", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: id });
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "verified" } } }),
  };
  mock.create.mockResolvedValue({ rpc, auth });
  expect(
    (await scheduleDecision({}, form({ kind: "accept_partial", session: id })))
      .success,
  ).toBeTruthy();
  expect(rpc).toHaveBeenCalledWith("decide_program_schedule", {
    p_assignment: id,
    p_version: id,
    p_day: id,
    p_rotation: 0,
    p_expected: 0,
    p_revision: 0,
    p_kind: "accept_partial",
    p_request: id,
    p_session: id,
    p_date: null,
  });
  auth.getUser.mockResolvedValue({ data: { user: null } });
  await scheduleDecision({}, form({ kind: "skip" }));
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("does not acknowledge stale or expired decisions and retains request identity on unknown outcomes", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ error: { code: "40001" } })
    .mockResolvedValueOnce({ data: null })
    .mockRejectedValueOnce(Error("offline"));
  mock.create.mockResolvedValue({
    rpc,
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } } }),
    },
  });
  expect((await scheduleDecision({}, form({ kind: "skip" }))).error).toContain(
    "changed",
  );
  expect(
    (await scheduleDecision({}, form({ kind: "skip" }))).error,
  ).toBeTruthy();
  expect((await scheduleDecision({}, form({ kind: "skip" }))).error).toContain(
    "same request",
  );
  expect(mock.refresh).not.toHaveBeenCalled();
  expect(rpc.mock.calls[2]).toEqual(rpc.mock.calls[1]);
});
it("independent starts send only favorite identity and preserve server redirects outside error handling", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: id });
  mock.create.mockResolvedValue({
    rpc,
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } } }),
    },
  });
  await startSelection({}, form({ favorite: id }));
  expect(rpc).toHaveBeenCalledWith("start_favorite_workout", {
    p_favorite: id,
    p_request: id,
  });
  expect(mock.redirect).toHaveBeenCalledWith(`/workout/${id}`);
});
it("favorite save passes only source identity/name rather than client snapshots or actual performance", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: id });
  mock.create.mockResolvedValue({
    rpc,
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } } }),
    },
  });
  expect(
    (
      await saveFavorite(
        {},
        form({ sourceType: "completed_ad_hoc", source: id, name: " Press " }),
      )
    ).success,
  ).toBeTruthy();
  expect(rpc).toHaveBeenCalledWith("save_favorite_workout", {
    p_type: "completed_ad_hoc",
    p_source: id,
    p_day: null,
    p_name: "Press",
    p_request: id,
  });
});
it("rename/remove are owner scoped and never claim success after a zero-row write", async () => {
  const read = vi.fn().mockResolvedValue({ data: null });
  const eq = vi.fn();
  eq.mockReturnValue({ eq, select: () => ({ maybeSingle: read }) });
  const update = vi.fn().mockReturnValue({ eq });
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } } }),
    },
    from: vi.fn().mockReturnValue({ update }),
  });
  expect(
    (
      await manageFavorite(
        {},
        form({ favorite: id, operation: "rename", name: "New" }),
      )
    ).error,
  ).toBeTruthy();
  expect(eq).toHaveBeenCalledWith("owner_id", "verified");
  expect(mock.refresh).not.toHaveBeenCalled();
});
