"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import { loadLibrary } from "@/features/exercises/queries";
import {
  filterExercises,
  libraryNoneId,
} from "@/features/exercises/recommendations";
import { exerciseMatch } from "./selection";
import { movementTile } from "./execution-queries";
import type { SelectionResult, MovementSearch } from "./execution-types";
export async function startProgramWorkout(
  _previous: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const version = form.get("version"),
    request = form.get("request"),
    day = Number(form.get("workout"));
  if (
    typeof version !== "string" ||
    !isUuid(version) ||
    typeof request !== "string" ||
    !isUuid(request) ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 366
  )
    return { error: "Choose a valid program workout." };
  let session: string;
  try {
    const client = await createClient();
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) return { error: "Sign in again." };
    const r = await client.rpc("start_program_workout", {
      p_version: version,
      p_workout: day,
      p_request: request,
    });
    if (r.error || typeof r.data !== "string" || !isUuid(r.data))
      return {
        error:
          "Could not start. Finish or resume an active workout first, or refresh and retry.",
      };
    session = r.data;
  } catch {
    return {
      error: "Start could not be confirmed. Retry with the same request.",
    };
  }
  revalidatePath("/workout", "layout");
  revalidatePath("/programs", "layout");
  redirect(`/workout/${session}`);
}
export async function selectProgramExercise(input: {
  movementId: string;
  exerciseId: string;
  expectedItemId: string | null;
  requestId: string;
  continueRecorded: boolean;
}): Promise<SelectionResult> {
  if (
    !isUuid(input.movementId) ||
    !isUuid(input.exerciseId) ||
    !isUuid(input.requestId) ||
    (input.expectedItemId !== null && !isUuid(input.expectedItemId)) ||
    typeof input.continueRecorded !== "boolean"
  )
    return { error: "Check the exercise selection." };
  try {
    const client = await createClient();
    const u = await client.auth.getUser();
    if (u.error || !u.data.user) return { error: "Sign in again." };
    const r = await client.rpc("select_program_exercise", {
      p_movement: input.movementId,
      p_exercise: input.exerciseId,
      p_expected: input.expectedItemId,
      p_request: input.requestId,
      p_continue: input.continueRecorded,
    });
    if (r.error) {
      if (r.error.code === "P0001") return { needsContinuation: true };
      if (r.error.code === "40001")
        return {
          conflict: true,
          error:
            "This movement changed elsewhere. Review the current selection before retrying.",
        };
      return {
        error:
          "Exercise not changed. Refresh to check whether the workout is still active.",
      };
    }
    if (typeof r.data !== "string" || !isUuid(r.data))
      return {
        error: "The workout closed before this selection could be saved.",
      };
    revalidatePath("/workout", "layout");
    return { itemId: r.data };
  } catch {
    return { error: "Selection could not be confirmed. Retry when connected." };
  }
}
export async function searchMovementExercises(
  movementId: string,
  filters: MovementSearch,
) {
  if (
    !isUuid(movementId) ||
    typeof filters.query !== "string" ||
    filters.query.length > 120 ||
    !["", "compound", "isolation", "other"].includes(filters.type) ||
    ![filters.pattern, filters.muscle].every((v) => v === "" || isUuid(v)) ||
    !Number.isInteger(filters.page) ||
    filters.page < 1 ||
    filters.page > 10000 ||
    typeof filters.equipmentOnly !== "boolean"
  )
    return { error: "Check search filters." };
  try {
    const client = await createClient({ readOnly: true });
    const u = await client.auth.getUser();
    if (u.error || !u.data.user) return { error: "Sign in again." };
    const m = await client
      .from("workout_movements")
      .select("slot_snapshot,workout_sessions!inner(status)")
      .eq("id", movementId)
      .eq("owner_id", u.data.user.id)
      .eq("workout_sessions.status", "in_progress")
      .maybeSingle();
    if (m.error || !m.data)
      return { error: "This movement is no longer active." };
    const library = await loadLibrary();
    const slot = m.data.slot_snapshot;
    const creator = library.exercises.find((e) => e.id === slot.exercise_id);
    const target = {
      patternId: slot.movement_pattern_id ?? creator?.primaryPatternId ?? null,
      muscleId: slot.primary_muscle_id ?? creator?.primaryMuscleIds[0] ?? null,
      exerciseType:
        slot.required_exercise_type ?? creator?.exerciseType ?? null,
      referenceEquipmentIds: creator?.equipmentIds ?? [],
    };
    const matches = filterExercises(
      library.exercises,
      {
        query: filters.query,
        patternId: filters.pattern || undefined,
        muscleId: filters.muscle || undefined,
        exerciseType:
          (filters.type as "" | "compound" | "isolation" | "other") ||
          undefined,
        availableEquipmentIds: filters.equipmentOnly
          ? library.availableEquipmentIds
          : undefined,
      },
      [],
      libraryNoneId(library),
    ).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return {
      items: matches
        .slice((filters.page - 1) * 20, filters.page * 20)
        .map((exercise) =>
          movementTile(
            {
              exercise,
              level: exerciseMatch(exercise, target),
              labels: [],
              equipmentAvailable: null,
            },
            library.patterns,
          ),
        ),
      total: matches.length,
    };
  } catch {
    return { error: "Exercise search could not be loaded. Retry." };
  }
}
