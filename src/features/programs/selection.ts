import { compatibleEquipment } from "@/features/exercises/recommendations";
import type { Exercise, ExerciseType } from "@/features/exercises/types";
import {
  catalogIntent,
  intentByKey,
  targetIntentKey,
} from "@/features/exercises/movement-intents";
export type MatchLevel = 1 | 2 | 3 | 4;
export const matchLabels: Record<MatchLevel, string> = {
  4: "",
  3: "Close",
  2: "Similar",
  1: "Same Muscle",
};
export type MovementTarget = {
  patternId: string | null;
  muscleId: string | null;
  exerciseType: ExerciseType | null;
  referenceEquipmentIds: readonly string[];
  intentKey?: string | null;
};
export function exerciseMatch(
  exercise: Exercise,
  target: MovementTarget,
): MatchLevel | null {
  const muscle =
    !!target.muscleId && exercise.primaryMuscleIds.includes(target.muscleId);
  const pattern =
    !!target.patternId && exercise.primaryPatternId === target.patternId;
  if (!muscle) return null;
  const sameType =
    !target.exerciseType || exercise.exerciseType === target.exerciseType;
  if (pattern && sameType) {
    const intent = intentByKey(
      target.intentKey ?? targetIntentKey(target.patternId, target.muscleId),
    );
    if (!intent) return 4;
    if (
      !intent.exercises.length ||
      (exercise.ownerId === null && intent.exercises.includes(exercise.slug))
    )
      return 4;
    const variation = catalogIntent(exercise);
    // Dips change the pressing path more substantially than grip or floor ROM.
    if (
      intent.key === "dip" ||
      variation?.key === "dip" ||
      intent.key === "incline_push_up" ||
      variation?.key === "incline_push_up"
    )
      return 2;
    return 3;
  }
  if (pattern || sameType) return 2;
  return 1;
}
export type SelectionCandidate = {
  exercise: Exercise;
  level: MatchLevel | null;
  labels: string[];
  equipmentAvailable: boolean | null;
};
export type SelectionInput = {
  target: MovementTarget;
  programPickId: string | null;
  lastChoiceId: string | null;
  selectedId?: string | null;
  availableEquipmentIds?: readonly string[];
  noneId?: string;
  equipmentOnly?: boolean;
  limit?: number;
};
export function rankMovementExercises(
  exercises: readonly Exercise[],
  input: SelectionInput,
): SelectionCandidate[] {
  const unique = new Map<string, Exercise>();
  for (const e of exercises)
    if (!e.archivedAt && !unique.has(e.id)) unique.set(e.id, e);
  const candidates = [...unique.values()].map((exercise) => ({
    exercise,
    level: exerciseMatch(exercise, input.target),
    labels: [
      ...(exercise.id === input.programPickId ? ["Program Recommended"] : []),
      ...(exercise.id === input.lastChoiceId ? ["Last Used"] : []),
    ],
    equipmentAvailable:
      input.availableEquipmentIds === undefined
        ? null
        : compatibleEquipment(
            exercise,
            input.availableEquipmentIds,
            input.noneId,
          ),
  }));
  const priority = (c: SelectionCandidate) =>
    c.exercise.id === input.programPickId
      ? 0
      : c.exercise.id === input.lastChoiceId
        ? 1
        : 2;
  const compare = (a: SelectionCandidate, b: SelectionCandidate) =>
    priority(a) - priority(b) ||
    (b.level ?? 0) - (a.level ?? 0) ||
    (a.exercise.slug < b.exercise.slug
      ? -1
      : a.exercise.slug > b.exercise.slug
        ? 1
        : a.exercise.id.localeCompare(b.exercise.id));
  const ranked = candidates
    .filter(
      (c) =>
        c.labels.length > 0 ||
        c.exercise.id === input.selectedId ||
        (c.level !== null &&
          (!input.equipmentOnly || c.equipmentAvailable !== false)),
    )
    .sort(compare);
  const chosen = ranked.slice(0, Math.max(2, Math.min(30, input.limit ?? 12)));
  const selected = ranked.find((c) => c.exercise.id === input.selectedId);
  if (selected && !chosen.some((c) => c.exercise.id === selected.exercise.id)) {
    const replace = chosen.findLastIndex((c) => priority(c) === 2);
    if (replace >= 0) chosen[replace] = selected;
    else chosen.push(selected);
  }
  return chosen.sort(compare);
}
