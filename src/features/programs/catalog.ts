export const catalogFacets = {
  goal: {
    strength: "Strength",
    hypertrophy: "Hypertrophy",
    general_fitness: "General Fitness",
    strength_size: "Strength + Size",
  },
  split: {
    full_body: "Full Body",
    upper_lower: "Upper / Lower",
    ppl: "PPL",
    body_part: "Body-Part Split",
  },
  experience: {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
  },
  equipment: {
    full_gym: "Full Gym",
    dumbbells: "Dumbbells",
    home_gym: "Home Gym",
    minimal_equipment: "Minimal Equipment",
  },
  frequency: {
    "2_3": "2–3 sessions",
    "4": "4 sessions",
    "5_6": "5–6 sessions",
    flexible: "Flexible rotation",
  },
  style: {
    high_intensity: "High Intensity",
    low_volume: "Low Volume",
    powerbuilding: "Powerbuilding",
    compound_focused: "Compound Focused",
  },
} as const;
export type CatalogFacet = keyof typeof catalogFacets;
export type CatalogFilters = Record<CatalogFacet, string> & {
  q: string;
  page: number;
};
export function catalogFilters(
  params: Record<string, string | string[] | undefined>,
): CatalogFilters {
  const f: CatalogFilters = {
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : "",
    page: 1,
    goal: "",
    split: "",
    experience: "",
    equipment: "",
    frequency: "",
    style: "",
  };
  for (const key of Object.keys(catalogFacets) as CatalogFacet[])
    if (
      typeof params[key] === "string" &&
      Object.hasOwn(catalogFacets[key], params[key])
    )
      f[key] = params[key];
  if (typeof params.page === "string" && /^\d{1,5}$/.test(params.page))
    f.page = Math.max(1, Math.min(10000, Number(params.page)));
  return f;
}
export function catalogURL(f: CatalogFilters, page = 1) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f))
    if (k !== "page" && v) p.set(k, String(v));
  if (page > 1) p.set("page", String(page));
  return "/programs" + (p.size ? "?" + p.toString() : "");
}
export type ProgramMedia = { asset_path: string; alt_text: string };
export type ProgramTag = { slug: string; name: string; category: string };
export type CatalogCard = {
  id: string;
  versionId: string;
  version: number;
  name: string;
  slug: string;
  summary: string;
  objective: string;
  experience: string;
  cycleLength: number;
  sessionsMin: number;
  sessionsMax: number;
  minutesMin: number;
  minutesMax: number;
  flexible: boolean;
  tags: ProgramTag[];
  cover: ProgramMedia | null;
  publishedAt: string;
  featured: boolean;
  equipmentIds?: string[];
};
export type CatalogPage = { items: CatalogCard[]; total: number; page: number };
export function programBadges(
  p: Pick<CatalogCard, "publishedAt" | "featured">,
  now: Date,
) {
  const age = now.getTime() - Date.parse(p.publishedAt);
  return [
    ...(p.featured ? ["Featured"] : []),
    ...(Number.isFinite(age) && age >= 0 && age < 30 * 86400000 ? ["New"] : []),
  ].slice(0, 2);
}
export function experienceLabel(value: string) {
  return value === "all_levels"
    ? "All levels"
    : value
        .split("_")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join("–");
}
export function goalLabel(value: string) {
  return catalogFacets.goal[value as keyof typeof catalogFacets.goal] ?? value;
}
export function frequencyLabel(
  p: Pick<CatalogCard, "sessionsMin" | "sessionsMax">,
) {
  return `${p.sessionsMin === p.sessionsMax ? p.sessionsMin : p.sessionsMin + "–" + p.sessionsMax} sessions / week`;
}
export type ProgramGuidance = {
  primaryGoal: string;
  secondaryGoal?: string;
  experience?: string;
  equipmentIds?: readonly string[];
  sessions?: number;
  split?: string;
  minutes?: number;
};
// No profile inference: callers must provide explicit preferences. Equipment is a
// hard constraint; the remaining weights express suitability, never guarantees.
export function rankPrograms(
  items: readonly CatalogCard[],
  preference: ProgramGuidance,
) {
  const goalMatches = (p: CatalogCard, g?: string) =>
    !!g &&
    (p.objective === g ||
      (p.objective === "strength_size" &&
        ["strength", "hypertrophy"].includes(g)));
  return items
    .filter(
      (p) =>
        !preference.equipmentIds ||
        (!!p.equipmentIds &&
          p.equipmentIds.every((id) => preference.equipmentIds!.includes(id))),
    )
    .map((p) => ({
      program: p,
      score:
        (goalMatches(p, preference.primaryGoal) ? 6 : 0) +
        (goalMatches(p, preference.secondaryGoal) ? 2 : 0) +
        (preference.experience &&
        p.experience.split("_").includes(preference.experience)
          ? 3
          : 0) +
        (preference.split &&
        p.tags.some(
          (t) => t.category === "split" && t.slug === preference.split,
        )
          ? 2
          : 0) +
        (preference.sessions &&
        preference.sessions >= p.sessionsMin &&
        preference.sessions <= p.sessionsMax
          ? 1
          : 0) +
        (preference.minutes && preference.minutes >= p.minutesMin ? 1 : 0),
    }))
    .sort(
      (a, b) => b.score - a.score || a.program.id.localeCompare(b.program.id),
    );
}
