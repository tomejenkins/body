import "server-only";
import {
  intentByKey,
  targetIntentKey,
  movementIntents,
} from "@/features/exercises/movement-intents";
import { allMovementOptions } from "@/features/workouts/suggested-shell";
import { loadLibrary } from "@/features/exercises/queries";
import { libraryNoneId } from "@/features/exercises/recommendations";
import { createClient } from "@/lib/supabase/server";
import {
  rankMovementExercises,
  exerciseMatch,
  type SelectionCandidate,
  type MovementTarget,
} from "./selection";
import { specialMeasurement } from "@/features/history/measurement";
import type { Workout } from "@/features/workouts/types";
import type { WorkoutMovement, MovementTile } from "./execution-types";
export function movementTile(
  candidate: SelectionCandidate,
  patterns: { id: string; slug: string }[],
): MovementTile {
  const e = candidate.exercise;
  return {
    id: e.id,
    name: e.name,
    level: candidate.level,
    labels: candidate.labels,
    equipmentAvailable: candidate.equipmentAvailable,
    supported: !specialMeasurement(e.id),
    visual: {
      slug: e.slug,
      ownerId: e.ownerId,
      patternSlug: patterns.find((p) => p.id === e.primaryPatternId)?.slug,
    },
  };
}
export async function loadWorkoutMovements(workout: Workout) {
  const client = await createClient({ readOnly: true });
  const rows = await client
    .from("workout_movements")
    .select("id,position,slot_snapshot")
    .eq("owner_id", workout.userId)
    .eq("workout_session_id", workout.id)
    .is("removed_at", null)
    .order("position");
  if (rows.error) throw Error("Program movements could not be loaded.");

  const [library, history] = await Promise.all([
    loadLibrary(),
    client.rpc("program_last_choices", { p_session: workout.id }),
  ]);
  if (history.error)
    throw Error("Previous movement choices could not be loaded.");
  const movements: WorkoutMovement[] = rows.data.map((row, index) => {
    const slot = row.slot_snapshot as {
      intent?: string;
      origin?: string;
      title?: string;
      exercise_id: string | null;
      movement_pattern_id: string | null;
      primary_muscle_id: string | null;
      required_exercise_type: MovementTarget["exerciseType"];
      target_sets: number;
      sets?: { set_type: string }[];
      equipment: string[];
    };
    const creator = library.exercises.find((e) => e.id === slot.exercise_id);
    const target: MovementTarget = {
      patternId: slot.movement_pattern_id ?? creator?.primaryPatternId ?? null,
      muscleId: slot.primary_muscle_id ?? creator?.primaryMuscleIds[0] ?? null,
      exerciseType:
        slot.required_exercise_type ?? creator?.exerciseType ?? null,
      referenceEquipmentIds: creator?.equipmentIds ?? slot.equipment ?? [],
    };
    target.intentKey =
      slot.intent ??
      targetIntentKey(target.patternId, target.muscleId, creator);
    const current = workout.items
      .filter((i) => i.programMovementId === row.id)
      .sort((a, b) => b.position - a.position)[0];
    const last =
      history.data?.find(
        (h: { movement_id: string }) => h.movement_id === row.id,
      )?.exercise_id ?? null;
    const candidates = rankMovementExercises(
      library.exercises.filter((e) => !specialMeasurement(e.id)),
      {
        target,
        programPickId: slot.exercise_id,
        lastChoiceId: last,
        selectedId: current?.exerciseId,
        availableEquipmentIds: library.availableEquipmentIds.length
          ? library.availableEquipmentIds
          : undefined,
        noneId: libraryNoneId(library),
      },
    );
    if (
      current &&
      !candidates.some((c) => c.exercise.id === current.exerciseId)
    ) {
      const e = library.exercises.find((e) => e.id === current.exerciseId);
      if (e)
        candidates.push({
          exercise: e,
          level: exerciseMatch(e, target),
          labels: [],
          equipmentAvailable: null,
        });
    }
    return {
      id: row.id,
      suggested: slot.origin === "ad_hoc",
      position: index + 1,
      label:
        slot.origin === "ad_hoc" && slot.title
          ? slot.title
          : (intentByKey(target.intentKey)?.title ??
            movementIntents.find(
              (i) =>
                i.patternId === target.patternId &&
                i.muscleId === target.muscleId,
            )?.title ??
            library.patterns.find((p) => p.id === target.patternId)?.name ??
            "Choose an exercise"),
      target,
      targetSets: slot.target_sets,
      workingSets: slot.sets?.length
        ? slot.sets.filter((s) => s.set_type !== "warm_up").length
        : slot.target_sets,
      currentItemId: current?.id ?? null,
      currentExerciseId: current?.exerciseId ?? null,
      candidates: candidates.map((c) => movementTile(c, library.patterns)),
    };
  });
  return {
    movements,
    facets: { patterns: library.patterns, muscles: library.muscles },
    movementOptions: workout.isProgram ? [] : allMovementOptions(library),
  };
}
