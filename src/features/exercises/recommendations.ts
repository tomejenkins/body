import type { Exercise, ExerciseFilters, Library, Preference } from "./types";
export function compatibleEquipment(
  exercise: Exercise,
  available: readonly string[] | undefined,
  noneId: string | undefined,
) {
  // Unclassified equipment is unknown, never silently treated as bodyweight.
  return (
    exercise.equipmentIds.length > 0 &&
    exercise.equipmentIds.every(
      (id) => id === noneId || available?.includes(id),
    )
  );
}
export function filterExercises(
  exercises: readonly Exercise[],
  filters: ExerciseFilters,
  preferences: readonly Preference[] = [],
  noneId?: string,
) {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const favorites = new Set(
    preferences.filter((p) => p.isFavorite).map((p) => p.exerciseId),
  );
  return exercises.filter(
    (e) =>
      !e.archivedAt &&
      (!query || e.name.toLowerCase().includes(query)) &&
      (!filters.patternId ||
        e.primaryPatternId === filters.patternId ||
        e.secondaryPatternIds.includes(filters.patternId)) &&
      (!filters.muscleId ||
        e.primaryMuscleIds.includes(filters.muscleId) ||
        e.secondaryMuscleIds.includes(filters.muscleId)) &&
      (!filters.exerciseType || e.exerciseType === filters.exerciseType) &&
      (filters.availableEquipmentIds === undefined ||
        compatibleEquipment(e, filters.availableEquipmentIds, noneId)) &&
      (!filters.favoritesOnly || favorites.has(e.id)) &&
      (!filters.customOnly || e.ownerId !== null),
  );
}
export type RecommendationInput = {
  patternId?: string;
  muscleId?: string;
  exerciseType?: ExerciseFilters["exerciseType"];
  availableEquipmentIds?: readonly string[];
  preferences?: readonly Preference[];
  recentIds?: readonly string[];
  excludedIds?: readonly string[];
  currentWorkoutIds?: readonly string[];
  allowWorkoutDuplicates?: boolean;
  limit?: number;
};
export const rankingWeights = {
  primaryPattern: 1000,
  preferred: 100,
  favorite: 10,
  recent: 5,
} as const;
export function recommendExercises(
  exercises: readonly Exercise[],
  input: RecommendationInput,
  noneId?: string,
) {
  const limit = Math.max(1, Math.min(5, Math.trunc(input.limit ?? 5) || 5));
  const excluded = new Set([
    ...(input.excludedIds ?? []),
    ...(input.allowWorkoutDuplicates ? [] : (input.currentWorkoutIds ?? [])),
  ]);
  const preferences = new Map(input.preferences?.map((p) => [p.exerciseId, p]));
  const seen = new Set<string>();
  const eligible = filterExercises(
    exercises,
    {
      patternId: input.patternId,
      muscleId: input.muscleId,
      exerciseType: input.exerciseType,
      availableEquipmentIds: input.availableEquipmentIds ?? [],
    },
    input.preferences,
    noneId,
  ).filter((e) => {
    // A programming target is a primary muscle requirement; assistance alone
    // must not make (for example) a pullover qualify as a chest-isolation slot.
    if (input.muscleId && !e.primaryMuscleIds.includes(input.muscleId))
      return false;
    if (
      seen.has(e.id) ||
      excluded.has(e.id) ||
      preferences.get(e.id)?.preference === "avoid"
    )
      return false;
    seen.add(e.id);
    return true;
  });
  const ranked = eligible
    .map((exercise) => {
      const preference = preferences.get(exercise.id);
      const recentIndex = input.recentIds?.indexOf(exercise.id) ?? -1;
      const primary =
        !!input.patternId && exercise.primaryPatternId === input.patternId;
      const reasons = [
        input.patternId
          ? primary
            ? "Primary movement match"
            : "Secondary movement match"
          : "Classification match",
        "Required equipment available",
      ];
      let score = primary ? rankingWeights.primaryPattern : 0;
      if (preference?.preference === "preferred") {
        score += rankingWeights.preferred;
        reasons.push("You prefer this exercise");
      }
      if (preference?.isFavorite) {
        score += rankingWeights.favorite;
        reasons.push("One of your favorites");
      }
      if (recentIndex >= 0) {
        score += rankingWeights.recent / (recentIndex + 1);
        reasons.push("Recently selected in your workouts");
      }
      if (input.muscleId) reasons.push("Primary muscle target matched");
      if (input.exerciseType)
        reasons.push(`${input.exerciseType} requirement met`);
      return { exercise, score, reasons };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.exercise.slug < b.exercise.slug
          ? -1
          : a.exercise.slug > b.exercise.slug
            ? 1
            : a.exercise.id < b.exercise.id
              ? -1
              : 1),
    );
  return {
    candidates: ranked.slice(0, limit),
    eligibleCount: eligible.length,
    limitedReason:
      eligible.length < limit
        ? input.availableEquipmentIds === undefined
          ? "Equipment is not configured. Only equipment-free matches are eligible."
          : `Only ${eligible.length} exercises meet all requirements. No incompatible alternatives were added.`
        : undefined,
  };
}
export function libraryNoneId(library: Pick<Library, "equipment">) {
  return library.equipment.find((e) => e.slug === "none")?.id;
}
