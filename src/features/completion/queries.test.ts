import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  user: vi.fn(),
  client: vi.fn(),
  stats: vi.fn(),
  achievements: vi.fn(),
  outcomes: vi.fn(),
  suggestions: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/session", () => ({ requireUser: m.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("./statistics", () => ({ loadTrainingSummary: m.stats }));
vi.mock("@/features/records/queries", () => ({
  loadAchievementSummary: m.achievements,
}));
vi.mock("@/features/programs/progression-queries", () => ({
  loadProgramOutcomes: m.outcomes,
  loadProgressionSuggestions: m.suggestions,
}));
import { loadCompletion } from "./queries";
import type { Workout } from "@/features/workouts/types";
const w: Workout = {
  id: "session",
  name: "Workout",
  userId: "owner",
  status: "completed",
  completionStatus: "partial",
  startedAt: "2026-11-09T10:00:00Z",
  finishedAt: "2026-11-09T11:00:00Z",
  items: [],
  weightUnit: "kg",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({ id: "owner" });
  m.stats.mockResolvedValue({
    session_id: w.id,
    working_sets: 2,
    exercises_performed: 1,
  });
  m.achievements.mockResolvedValue({ featured: [], additional: [] });
  m.outcomes.mockResolvedValue([]);
  m.suggestions.mockResolvedValue({});
});
function client(favorites: unknown[]) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    returns: vi.fn().mockResolvedValue({ data: favorites }),
  };
  for (const fn of [q.select, q.eq, q.order, q.limit]) fn.mockReturnValue(q);
  const from = vi.fn().mockReturnValue(q);
  m.client.mockResolvedValue({ from });
  return { q, from };
}
it("verifies ownership and closed status before any summary work", async () => {
  await expect(loadCompletion({ ...w, userId: "foreign" })).rejects.toThrow(
    "Completed workout",
  );
  await expect(loadCompletion({ ...w, status: "in_progress" })).rejects.toThrow(
    "Completed workout",
  );
  expect(m.client).not.toHaveBeenCalled();
  expect(m.stats).not.toHaveBeenCalled();
});
it("composes only authoritative sources and bounded owner Favorite metadata without a catalog or mutation", async () => {
  const { q, from } = client([
    {
      id: "favorite",
      name: "Saved",
      source_type: "completed_ad_hoc",
      source_key: w.id,
    },
  ]);
  const r = await loadCompletion(w);
  expect(r.favorite.saved?.id).toBe("favorite");
  expect(q.eq).toHaveBeenCalledWith("owner_id", "owner");
  expect(q.limit).toHaveBeenCalledWith(100);
  expect(from).toHaveBeenCalledTimes(1);
  for (const fn of [m.stats, m.achievements])
    expect(fn).toHaveBeenCalledWith(w.id);
  expect(m.suggestions).toHaveBeenCalledTimes(1);
});
it("suppresses ineligible saves, recognizes a launched Favorite and reports the existing cap", async () => {
  client(
    Array.from({ length: 100 }, (_, i) => ({
      id: `favorite${i}`,
      name: "Saved",
      source_type: "completed_ad_hoc",
      source_key: `source${i}`,
    })),
  );
  expect(
    (await loadCompletion({ ...w, favoriteId: "favorite0" })).favorite.saved
      ?.id,
  ).toBe("favorite0");
  expect((await loadCompletion(w)).favorite.atCapacity).toBe(true);
  m.stats.mockResolvedValue({
    session_id: w.id,
    working_sets: 0,
    exercises_performed: 0,
  });
  expect((await loadCompletion(w)).favorite.eligible).toBe(false);
});
