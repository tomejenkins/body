import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import type { WeightUnit } from "@/features/sets/model";
import {
  historyFilter,
  pageCursor,
  type HistorySummary,
  type ExerciseHistory,
} from "./model";
export async function loadHistory(filter: unknown, cursor: unknown) {
  await requireUser("/history");
  const client = await createClient({ readOnly: true });
  const selected = historyFilter(filter),
    page = pageCursor(cursor);
  const result = await client.rpc("workout_history", {
    p_filter: selected,
    p_before: page?.before ?? null,
    p_before_id: page?.beforeId ?? null,
    p_limit: 21,
  });
  if (result.error)
    throw new Error("Workout history could not be loaded. Please retry.");
  const rows = result.data as HistorySummary[];
  return {
    filter: selected,
    rows: rows.slice(0, 20),
    hasMore: rows.length > 20,
  };
}
export async function loadExerciseHistory(id: string, cursor: unknown) {
  const user = await requireUser(`/exercises/${id}/history`);
  const client = await createClient({ readOnly: true });
  const page = pageCursor(cursor);
  const [exercise, history, preference] = await Promise.all([
    client
      .from("exercises")
      .select("id,name,slug,owner_id,archived_at")
      .eq("id", id)
      .maybeSingle<{
        id: string;
        name: string;
        slug: string;
        owner_id: string | null;
        archived_at: string | null;
      }>(),
    client.rpc("exercise_history", {
      p_exercise: id,
      p_before: page?.before ?? null,
      p_before_id: page?.beforeId ?? null,
      p_limit: 11,
    }),
    client
      .from("account_preferences")
      .select("display_weight_unit")
      .eq("owner_id", user.id)
      .single<{ display_weight_unit: WeightUnit }>(),
  ]);
  if (exercise.error || history.error || preference.error)
    throw new Error("Exercise history could not be loaded. Please retry.");
  if (!exercise.data) return null;
  const data = history.data as ExerciseHistory;
  return {
    exercise: exercise.data,
    history: { ...data, entries: data.entries.slice(0, 10) },
    hasMore: data.entries.length > 10,
    unit: preference.data.display_weight_unit,
  };
}
