"use server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import {
  validRange,
  validZone,
  validMonth,
  type ExerciseProgress,
  type TrainingProgress,
  type ProgressRange,
} from "./model";
import type { WeightUnit } from "@/features/sets/model";
export type ProgressResult<T> =
  { data: T; unit: WeightUnit } | { error: string };
async function read<T>(
  rpc: string,
  args: Record<string, unknown>,
): Promise<ProgressResult<T>> {
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { error: "Sign in again to view progress." };
    const [response, preference] = await Promise.all([
      client.rpc(rpc, args),
      client
        .from("account_preferences")
        .select("display_weight_unit")
        .eq("owner_id", identity.data.user.id)
        .single<{ display_weight_unit: WeightUnit }>(),
    ]);
    if (response.error || preference.error || !response.data)
      return { error: "Progress could not be loaded. Please retry." };
    return {
      data: response.data as T,
      unit: preference.data.display_weight_unit,
    };
  } catch {
    return {
      error: "Progress could not be loaded. Check your connection and retry.",
    };
  }
}
export async function readExerciseProgress(
  id: string,
  range: ProgressRange,
  zone: string,
  load: number | null = null,
  category: string | null = null,
  reps: number | null = null,
): Promise<ProgressResult<ExerciseProgress>> {
  if (
    !isUuid(id) ||
    !validRange(range) ||
    !validZone(zone) ||
    (load !== null &&
      (!Number.isFinite(load) ||
        load <= 0 ||
        load > 100000 ||
        !/^\d+(\.\d{1,3})?$/.test(String(load)))) ||
    (category !== null && !["loaded", "added"].includes(category)) ||
    (load === null) !== (category === null) ||
    (reps !== null && (!Number.isInteger(reps) || reps < 1 || reps > 1000))
  )
    return { error: "Choose a valid progress view." };
  return read<ExerciseProgress>("exercise_progress", {
    p_exercise: id,
    p_range: range,
    p_zone: zone,
    p_load: load,
    p_category: category,
    p_reps: reps,
  });
}
export async function readTrainingProgress(
  range: ProgressRange,
  zone: string,
  month: string | null = null,
  exercise: string | null = null,
): Promise<ProgressResult<TrainingProgress>> {
  if (
    !validRange(range) ||
    !validZone(zone) ||
    (month !== null && !validMonth(month)) ||
    (exercise !== null && !isUuid(exercise))
  )
    return { error: "Choose a valid progress period." };
  return read<TrainingProgress>("training_progress", {
    p_range: range,
    p_zone: zone,
    p_month: month,
    p_exercise: exercise,
  });
}
