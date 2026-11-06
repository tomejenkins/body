import definitions from "./movement-intents.json";
import type { Exercise, ExerciseType, Taxon } from "./types";

// A refinement of the existing primary pattern/muscle taxonomy, never an
// exercise identity or an equipment classification. Explicit slugs are curated
// system-catalog metadata; private exercises retain their declared taxonomy.
export type MovementIntent = {
  key: string;
  title: string;
  pattern: string;
  muscle: string;
  patternId: string;
  muscleId: string;
  exerciseType: ExerciseType;
  exercises: readonly string[];
};
export const movementIntents = definitions as readonly MovementIntent[];
export function intentByKey(key: string | null | undefined) {
  return movementIntents.find((intent) => intent.key === key);
}
export function supportsIntent(
  exercise: Exercise,
  intent: MovementIntent,
  patterns: readonly Taxon[],
  muscles: readonly Taxon[],
) {
  return (
    !exercise.archivedAt &&
    exercise.exerciseType === intent.exerciseType &&
    patterns.some(
      (p) => p.slug === intent.pattern && p.id === exercise.primaryPatternId,
    ) &&
    muscles.some(
      (m) =>
        m.slug === intent.muscle && exercise.primaryMuscleIds.includes(m.id),
    ) &&
    (!intent.exercises.length ||
      (exercise.ownerId === null && intent.exercises.includes(exercise.slug)))
  );
}
export function catalogIntent(exercise: Exercise) {
  if (exercise.ownerId !== null) return undefined;
  return movementIntents.find((intent) =>
    intent.exercises.includes(exercise.slug),
  );
}

export function targetIntentKey(
  patternId: string | null,
  muscleId: string | null,
  creator?: Exercise,
) {
  if (
    creator?.primaryPatternId === patternId &&
    creator.primaryMuscleIds.includes(muscleId ?? "")
  ) {
    const intent =
      creator.ownerId === null
        ? movementIntents.find(
            (i) =>
              i.muscleId === muscleId && i.exercises.includes(creator.slug),
          )
        : undefined;
    if (intent) return intent.key;
  }
  // Historical flat-press snapshots have no finer mechanics field.
  const flat = intentByKey("flat_press");
  return flat?.patternId === patternId && flat.muscleId === muscleId
    ? flat.key
    : null;
}
