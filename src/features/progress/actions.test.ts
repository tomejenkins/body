import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }));
import { readExerciseProgress, readTrainingProgress } from "./actions";
const id = "12345678-1234-1234-1234-123456789012";
beforeEach(() => vi.resetAllMocks());
it("validates IDs/ranges/months/loads before private access", async () => {
  for (const r of [
    await readExerciseProgress("bad", "90", "UTC"),
    await readExerciseProgress(id, "90", "bad"),
    await readExerciseProgress(id, "90", "UTC", NaN, "loaded"),
    await readExerciseProgress(id, "90", "UTC", 22.6801, "loaded"),
    await readTrainingProgress("90", "UTC", "2026-01-02"),
  ])
    expect("error" in r).toBe(true);
  expect(mock.create).not.toHaveBeenCalled();
});
it("verifies auth before every read", async () => {
  const rpc = vi.fn();
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc,
  });
  expect("error" in (await readExerciseProgress(id, "90", "UTC"))).toBe(true);
  expect("error" in (await readTrainingProgress("90", "UTC"))).toBe(true);
  expect(rpc).not.toHaveBeenCalled();
});
it("sends only validated selectors, with verified owner only on preference lookup", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { series: [] }, error: null });
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi
      .fn()
      .mockResolvedValue({ data: { display_weight_unit: "lb" }, error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  mock.create.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "verified" } }, error: null }),
    },
    rpc,
    from: () => chain,
  });
  expect(
    await readExerciseProgress(id, "90", "UTC", 22.68, "loaded", 5),
  ).toEqual({ data: { series: [] }, unit: "lb" });
  expect(rpc).toHaveBeenCalledWith("exercise_progress", {
    p_exercise: id,
    p_range: "90",
    p_zone: "UTC",
    p_load: 22.68,
    p_category: "loaded",
    p_reps: 5,
  });
  expect(chain.eq).toHaveBeenCalledWith("owner_id", "verified");
});
it("never turns transport errors into empty analytics", async () => {
  mock.create.mockRejectedValue(new Error("secret provider detail"));
  const r = await readTrainingProgress("all", "UTC");
  expect("error" in r && r.error).toContain("could not be loaded");
  expect("error" in r && r.error).not.toContain("secret");
});
