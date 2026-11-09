import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  create: vi.fn(),
  redirect: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mock.refresh }));
import { startExerciseWorkout } from "./exercise-setup-actions";
const id = "12345678-1234-1234-1234-123456789012",
  other = "12345678-1234-1234-1234-123456789013";
function form(ids = [id]) {
  const f = new FormData();
  f.set("request", other);
  for (const x of ids) f.append("exercise", x);
  return f;
}
beforeEach(() => vi.resetAllMocks());
it("rejects malformed, duplicate and unbounded lists before private access", async () => {
  for (const ids of [[], [id, id], ["invalid"], Array(7).fill(id)])
    expect((await startExerciseWorkout({}, form(ids))).error).toBeTruthy();
  expect(mock.create).not.toHaveBeenCalled();
});
it("verifies auth and forwards only ordered canonical IDs and request identity", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: id });
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner" } } }),
    },
    rpc,
  });
  await startExerciseWorkout({}, form([other, id]));
  expect(rpc).toHaveBeenCalledWith("start_exercise_workout", {
    p_exercises: [other, id],
    p_request: other,
  });
  expect(mock.redirect).toHaveBeenCalledWith(`/workout/${id}`);
});
it("does not navigate after an unconfirmed or rejected start", async () => {
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner" } } }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "23514" } }),
  });
  expect((await startExerciseWorkout({}, form())).error).toBeTruthy();
  expect(mock.redirect).not.toHaveBeenCalled();
});
