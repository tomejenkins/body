import { describe, it, expect } from "vitest";
import {
  catalogFilters,
  catalogURL,
  programBadges,
  rankPrograms,
  type CatalogCard,
} from "./catalog";
const card: CatalogCard = {
  id: "a",
  versionId: "v",
  version: 1,
  name: "Plan",
  slug: "plan",
  summary: "Original",
  objective: "strength_size",
  experience: "beginner_intermediate",
  cycleLength: 8,
  sessionsMin: 3,
  sessionsMax: 4,
  minutesMin: 40,
  minutesMax: 65,
  flexible: true,
  tags: [{ slug: "full_body", category: "split", name: "Full Body" }],
  cover: null,
  publishedAt: "2026-11-01T00:00:00Z",
  featured: false,
  equipmentIds: ["db"],
};
describe("catalog controls", () => {
  it("validates combined filters, trims search and bounds pagination without accepting arrays", () => {
    const f = catalogFilters({
      q: "  upper  ",
      goal: "strength_size",
      split: "upper_lower",
      equipment: "full_gym",
      experience: "intermediate",
      frequency: "4",
      style: "powerbuilding",
      page: "2",
    });
    expect(f).toMatchObject({
      q: "upper",
      page: 2,
      split: "upper_lower",
      style: "powerbuilding",
    });
    expect(catalogURL(f, 3)).toContain("page=3");
    expect(
      catalogFilters({
        goal: "<script>",
        page: "-1",
        equipment: ["dumbbells"],
      }),
    ).toMatchObject({ goal: "", page: 1, equipment: "" });
    expect(
      catalogFilters({ page: "99999", q: "a".repeat(200) }).q,
    ).toHaveLength(100);
    expect(catalogURL(catalogFilters({}))).toBe("/programs");
  });
  it("awards New from first publication only, expires at 30 days and rejects future/invalid ages", () => {
    expect(programBadges(card, new Date("2026-11-30T23:59:59Z"))).toEqual([
      "New",
    ]);
    expect(programBadges(card, new Date("2026-12-01T00:00:00Z"))).toEqual([]);
    expect(programBadges(card, new Date("2026-10-31"))).toEqual([]);
    expect(
      programBadges(
        { ...card, publishedAt: "invalid", featured: true },
        new Date(),
      ),
    ).toEqual(["Featured"]);
    expect(
      programBadges({ ...card, featured: true }, new Date("2026-11-05")),
    ).toEqual(["Featured", "New"]);
  });
  it("uses explicit guidance, hard equipment eligibility and deterministic ties", () => {
    const items = [
      { ...card, id: "b" },
      card,
      { ...card, id: "c", equipmentIds: ["machine"] },
    ];
    const ranked = rankPrograms(items, {
      primaryGoal: "strength",
      secondaryGoal: "hypertrophy",
      experience: "beginner",
      equipmentIds: ["db"],
      sessions: 3,
      split: "full_body",
      minutes: 50,
    });
    expect(ranked.map((x) => x.program.id)).toEqual(["a", "b"]);
    expect(ranked[0].score).toBe(15);
    expect(
      rankPrograms(items, { primaryGoal: "strength", equipmentIds: [] }),
    ).toEqual([]);
    expect(rankPrograms(items, { primaryGoal: "strength" })).toHaveLength(3);
  });
});
