import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import type { Workout, WorkoutStatus } from "./types";
type SessionRow = {
  id: string;
  name: string;
  status: WorkoutStatus;
  completion_status: Workout["completionStatus"];
  started_at: string;
  finished_at: string | null;
};
type ItemRow = {
  id: string;
  exercise_id: string;
  exercise_name_snapshot: string;
  position: number;
  status: string;
  workout_sets: { id: string }[];
  exercises: {
    slug: string;
    owner_id: string | null;
    exercise_movement_patterns: {
      is_primary: boolean;
      movement_patterns: { slug: string } | null;
    }[];
  } | null;
};
export async function loadWorkout(id?: string): Promise<Workout | null> {
  const user = await requireUser(id ? `/workout/${id}` : "/workout");
  const client = await createClient({ readOnly: true });
  let query = client
    .from("workout_sessions")
    .select("id,name,status,completion_status,started_at,finished_at")
    .eq("owner_id", user.id);
  query = id ? query.eq("id", id) : query.eq("status", "in_progress");
  const result = await query.maybeSingle<SessionRow>();
  if (result.error) throw new Error("Workout could not be loaded.");
  if (!result.data) return null;
  const session = result.data;
  const items: ItemRow[] = [];
  for (let from = 0; ; from += 500) {
    const response = await client
      .from("workout_exercises")
      .select(
        "id,exercise_id,exercise_name_snapshot,position,status,workout_sets(id),exercises:exercises!workout_exercises_exercise_id_fkey(slug,owner_id,exercise_movement_patterns(is_primary,movement_patterns(slug)))",
      )
      .eq("owner_id", user.id)
      .eq("workout_session_id", session.id)
      .is("removed_at", null)
      .order("position")
      .range(from, from + 499)
      .returns<ItemRow[]>();
    if (response.error)
      throw new Error("Workout selections could not be loaded.");
    items.push(...response.data);
    if (response.data.length < 500) break;
  }
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    completionStatus: session.completion_status,
    startedAt: session.started_at,
    finishedAt: session.finished_at,
    items: items.map((row) => ({
      id: row.id,
      exerciseId: row.exercise_id,
      name: row.exercise_name_snapshot,
      position: row.position,
      canRemove: row.status === "pending" && row.workout_sets.length === 0,
      visual: {
        slug: row.exercises?.slug ?? "",
        ownerId: row.exercises?.owner_id ?? "unavailable",
        patternSlug: row.exercises?.exercise_movement_patterns.find(
          (p) => p.is_primary,
        )?.movement_patterns?.slug,
      },
    })),
  };
}
