import { compatibleEquipment } from "@/features/exercises/recommendations";
import type { Exercise, ExerciseType } from "@/features/exercises/types";
export type MatchLevel = 1 | 2 | 3 | 4;
export const matchLabels: Record<MatchLevel, string> = {
  4: "Best Match",
  3: "Close Match",
  2: "Similar",
  1: "Same Muscle",
};
export type MovementTarget = {
  patternId: string | null;
  muscleId: string | null;
  exerciseType: ExerciseType | null;
  referenceEquipmentIds: readonly string[];
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
    const sameEquipment =
      target.referenceEquipmentIds.length > 0 &&
      exercise.equipmentIds.length === target.referenceEquipmentIds.length &&
      exercise.equipmentIds.every((id) =>
        target.referenceEquipmentIds.includes(id),
      );
    return sameEquipment ? 4 : 3;
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
      ...(exercise.id === input.programPickId ? ["Program Pick"] : []),
      ...(exercise.id === input.lastChoiceId ? ["Your Last Choice"] : []),
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
  const equipmentOverlap = (c: SelectionCandidate) =>
    c.exercise.equipmentIds.filter((id) =>
      input.target.referenceEquipmentIds.includes(id),
    ).length;
  const compare = (a: SelectionCandidate, b: SelectionCandidate) =>
    priority(a) - priority(b) ||
    (b.level ?? 0) - (a.level ?? 0) ||
    equipmentOverlap(b) - equipmentOverlap(a) ||
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
        (c.level !== null && c.equipmentAvailable !== false),
    )
    .sort(compare);
  const chosen = ranked.slice(0, Math.max(2, Math.min(30, input.limit ?? 12)));
  const selected = ranked.find((c) => c.exercise.id === input.selectedId);
  if (selected && !chosen.some((c) => c.exercise.id === selected.exercise.id)) {
    const replace = chosen.findLastIndex((c) => priority(c) === 2);
    if (replace >= 0) chosen[replace] = selected;
    else chosen.push(selected);
  }
  // Keep a representative of each available match level in the compact pool.
  // The displayed pool still sorts 4→1; See All exposes every eligible exercise.
  for (const level of [4, 3, 2, 1] as const) {
    if (chosen.some((c) => c.level === level)) continue;
    const candidate = ranked.find((c) => c.level === level);
    if (!candidate) continue;
    const replace = chosen.findLastIndex(
      (c) =>
        priority(c) === 2 &&
        c.exercise.id !== input.selectedId &&
        chosen.filter((x) => x.level === c.level).length > 1,
    );
    if (replace >= 0) chosen[replace] = candidate;
  }
  return chosen.sort(compare);
}
