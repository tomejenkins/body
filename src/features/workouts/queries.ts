import { specialMeasurement } from "@/features/history/measurement";
import type { LoggedSet, WeightUnit } from "@/features/sets/model";
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
  program_movement_id: string | null;
  exercise_name_snapshot: string;
  position: number;
  status: string;
  prescribed_sets: number | null;
  logging_kind: import("@/features/history/model").LoggingKind;
  workout_sets: LoggedSet[];
  exercises: {
    slug: string;
    exercise_type: string;
    exercise_equipment: { equipment_types: { slug: string } | null }[];
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
  const continuity = await client.rpc("workout_continuity", {
    p_session: id ?? null,
  });
  if (continuity.error) throw new Error("Workout status could not be loaded.");
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
        "id,exercise_id,program_movement_id,exercise_name_snapshot,position,status,prescribed_sets,logging_kind,exercises:exercises!workout_exercises_exercise_id_fkey(slug,owner_id,exercise_type,exercise_equipment(equipment_types(slug)),exercise_movement_patterns(is_primary,movement_patterns(slug)))",
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
  const sets: LoggedSet[] = [];
  for (let from = 0; ; from += 500) {
    const response = await client
      .from("workout_sets")
      .select("*,workout_exercises!inner(workout_session_id,removed_at)")
      .eq("owner_id", user.id)
      .eq("workout_exercises.workout_session_id", session.id)
      .is("workout_exercises.removed_at", null)
      .order("id")
      .range(from, from + 499)
      .returns<LoggedSet[]>();
    if (response.error) throw new Error("Workout sets could not be loaded.");
    sets.push(...response.data);
    if (response.data.length < 500) break;
  }
  const byItem = new Map<string, LoggedSet[]>();
  for (const set of sets) {
    const group = byItem.get(set.workout_exercise_id) ?? [];
    group.push(set);
    byItem.set(set.workout_exercise_id, group);
  }
  for (const item of items) item.workout_sets = byItem.get(item.id) ?? [];
  const preference = await client
    .from("account_preferences")
    .select("display_weight_unit,preferred_effort_scale")
    .eq("owner_id", user.id)
    .single<{
      display_weight_unit: WeightUnit;
      preferred_effort_scale: import("@/features/sets/effort").EffortScale;
    }>();
  if (preference.error)
    throw new Error("Weight preference could not be loaded.");
  return {
    continuity: continuity.data as
      import("@/features/continuity/model").Continuity | null,
    userId: user.id,
    weightUnit: preference.data.display_weight_unit,
    preferredEffortScale: preference.data.preferred_effort_scale,
    id: session.id,
    name: session.name,
    status: session.status,
    completionStatus: session.completion_status,
    startedAt: session.started_at,
    finishedAt: session.finished_at,
    items: items.map((row) => ({
      id: row.id,
      programMovementId: row.program_movement_id,
      exerciseId: row.exercise_id,
      name: row.exercise_name_snapshot,
      position: row.position,
      canRemove:
        row.status === "pending" &&
        row.workout_sets.every(
          (s) => s.is_automatic && s.inputs_confirmed === false,
        ),
      loggingKind:
        row.logging_kind === "legacy"
          ? (specialMeasurement(row.exercise_id) ?? "legacy")
          : row.logging_kind,
      exerciseType: row.exercises?.exercise_type ?? "other",
      prescribedSets: row.prescribed_sets,
      sets: row.workout_sets.sort((a, b) => a.position - b.position),
      bodyweightEligible:
        !!row.exercises?.exercise_equipment.length &&
        row.exercises.exercise_equipment.every((e) =>
          [
            "none",
            "pull_up_bar",
            "neutral_grip_handles",
            "parallel_bars",
            "step",
            "suspension_trainer",
          ].includes(e.equipment_types?.slug ?? ""),
        ),
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
