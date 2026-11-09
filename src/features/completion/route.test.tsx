import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  workout: vi.fn(),
  summary: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Error(`redirect:${url}`);
  }),
  notFound: vi.fn(() => {
    throw Error("not-found");
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: m.redirect,
  notFound: m.notFound,
}));
vi.mock("@/features/workouts/queries", () => ({ loadWorkout: m.workout }));
vi.mock("@/features/completion/queries", () => ({ loadCompletion: m.summary }));
vi.mock("@/components/completion/workout-complete", () => ({
  WorkoutComplete: () => null,
}));
import Page from "@/app/(app)/workout/[id]/complete/page";
const id = "12345678-1234-1234-1234-123456789012";
const props = (value = id) => ({
  params: Promise.resolve({ id: value }),
  searchParams: Promise.resolve({}),
});
beforeEach(() => {
  m.workout.mockReset();
  m.summary.mockReset();
  m.redirect.mockClear();
  m.notFound.mockClear();
});
it("rejects invalid/missing/foreign resources before loading private summaries", async () => {
  await expect(Page(props("invalid"))).rejects.toThrow("not-found");
  expect(m.workout).not.toHaveBeenCalled();
  m.workout.mockResolvedValue(null);
  await expect(Page(props())).rejects.toThrow("not-found");
  expect(m.summary).not.toHaveBeenCalled();
});
it("routes active/abandoned sessions safely and reads completed facts without re-closing", async () => {
  m.workout.mockResolvedValue({ id, status: "in_progress" });
  await expect(Page(props())).rejects.toThrow(`redirect:/workout/${id}`);
  m.workout.mockResolvedValue({ id, status: "abandoned" });
  await expect(Page(props())).rejects.toThrow(`redirect:/history/${id}`);
  expect(m.summary).not.toHaveBeenCalled();
  const saved = { id, status: "completed" };
  m.workout.mockResolvedValue(saved);
  m.summary.mockResolvedValue({});
  expect(await Page(props())).toBeTruthy();
  expect(m.summary).toHaveBeenCalledWith(saved);
});
