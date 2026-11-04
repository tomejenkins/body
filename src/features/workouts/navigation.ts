import { isUuid } from "@/features/exercises/validation";
import type { ExerciseType } from "@/features/exercises/types";
export type BuilderFilters = {
  search: string;
  movement: string;
  muscle: string;
  type: ExerciseType | "";
  equipment: string[];
  equipmentOnly: boolean;
  favorites: boolean;
  custom: boolean;
  refine: boolean;
  recents: boolean;
  suggestions: boolean;
};
export type QueryValues = Record<string, string | string[] | undefined>;
const uuid = (value: unknown) =>
  typeof value === "string" && isUuid(value) ? value : "";
export function parseBuilderFilters(query: URLSearchParams): BuilderFilters {
  return {
    search: (query.get("search") ?? "").slice(0, 120),
    movement: uuid(query.get("movement")),
    muscle: uuid(query.get("muscle")),
    type: ["compound", "isolation", "other"].includes(query.get("type") ?? "")
      ? (query.get("type") as ExerciseType)
      : "",
    equipment: [
      ...new Set((query.get("equipment") ?? "").split(",").filter(isUuid)),
    ].slice(0, 80),
    equipmentOnly: query.get("equipmentOnly") === "1",
    favorites: query.get("favorites") === "1",
    custom: query.get("custom") === "1",
    refine: query.get("refine") === "1",
    recents: query.get("recents") === "1",
    suggestions: query.get("suggestions") === "1",
  };
}
export function builderFilterQuery(state: BuilderFilters) {
  const q = new URLSearchParams();
  for (const key of ["search", "movement", "muscle", "type"] as const)
    if (state[key]) q.set(key, state[key]);
  if (state.equipment.length) q.set("equipment", state.equipment.join(","));
  for (const key of [
    "equipmentOnly",
    "favorites",
    "custom",
    "refine",
    "recents",
    "suggestions",
  ] as const)
    if (state[key]) q.set(key, "1");
  // Preserve an explicit empty/default view instead of reapplying account equipment.
  q.set("view", "1");
  return q;
}
export function queryParams(values: QueryValues) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (typeof value === "string") q.set(key, value);
  return q;
}
export function builderHref(workoutId: string, filters?: BuilderFilters) {
  if (!isUuid(workoutId)) return "/workout";
  const query = filters ? builderFilterQuery(filters).toString() : "";
  return `/workout/${workoutId}/select${query ? `?${query}` : ""}`;
}
export function exerciseHref(
  exerciseId: string,
  workoutId?: string,
  filters?: BuilderFilters,
  history = false,
) {
  if (!isUuid(exerciseId)) return "/exercises";
  const path = `/exercises/${exerciseId}${history ? "/history" : ""}`;
  if (typeof workoutId !== "string" || !isUuid(workoutId)) return path;
  const q = new URLSearchParams({ workoutId });
  if (filters) q.set("builder", builderFilterQuery(filters).toString());
  return `${path}?${q}`;
}
export function contextFilters(value: unknown) {
  return typeof value === "string" && value.length <= 6000
    ? parseBuilderFilters(new URLSearchParams(value))
    : undefined;
}
