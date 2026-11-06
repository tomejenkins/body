import "server-only";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import type { WorkoutStatus } from "./types";
export type WorkoutContext = {
  id: string;
  status: WorkoutStatus;
  alreadyAdded: boolean;
  loggerItemId?: string;
};
export async function loadWorkoutContext(
  workoutId: unknown,
  exerciseId: string,
  workoutItemId?: unknown,
): Promise<WorkoutContext | null> {
  if (
    typeof workoutId !== "string" ||
    !isUuid(workoutId) ||
    !isUuid(exerciseId)
  )
    return null;
  const user = await requireUser(`/exercises/${exerciseId}`);
  const client = await createClient({ readOnly: true });
  const continuity = await client.rpc("workout_continuity", {
    p_session: workoutId,
  });
  if (continuity.error)
    throw new Error("Workout context could not be confirmed.");
  const workout = await client
    .from("workout_sessions")
    .select("id,status")
    .eq("id", workoutId)
    .eq("owner_id", user.id)
    .maybeSingle<{ id: string; status: WorkoutStatus }>();
  if (workout.error)
    throw new Error("Workout context could not be loaded. Please retry.");
  if (!workout.data) return null;
  if (workout.data.status !== "in_progress")
    return { ...workout.data, alreadyAdded: false };
  let selectionQuery = client
    .from("workout_exercises")
    .select("id")
    .eq("workout_session_id", workout.data.id)
    .eq("exercise_id", exerciseId)
    .eq("owner_id", user.id)
    .is("removed_at", null)
    .limit(1);
  if (typeof workoutItemId === "string" && isUuid(workoutItemId))
    selectionQuery = selectionQuery.eq("id", workoutItemId);
  const selection = await selectionQuery.maybeSingle();
  if (selection.error)
    throw new Error("Workout selection could not be loaded. Please retry.");
  return {
    ...workout.data,
    alreadyAdded: !!selection.data,
    loggerItemId:
      typeof workoutItemId === "string" &&
      isUuid(workoutItemId) &&
      selection.data?.id === workoutItemId
        ? workoutItemId
        : undefined,
  };
}
