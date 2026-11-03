"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid, parseExercise } from "./validation";
import type { MutationState } from "./types";
async function context() {
  const client = await createClient();
  const identity = await client.auth.getUser();
  if (identity.error || !identity.data.user)
    throw new Error("Sign in again to continue.");
  return { client, user: identity.data.user };
}
export async function saveExercise(
  _state: MutationState,
  data: FormData,
): Promise<MutationState> {
  let input;
  try {
    input = parseExercise(data);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Check the exercise fields.",
    };
  }
  try {
    const { client } = await context();
    const result = await client.rpc("save_custom_exercise", {
      p_id: input.id,
      p_name: input.name,
      p_type: input.exerciseType,
      p_primary_pattern: input.primaryPatternId,
      p_secondary_patterns: input.secondaryPatternIds,
      p_primary_muscles: input.primaryMuscleIds,
      p_secondary_muscles: input.secondaryMuscleIds,
      p_equipment: input.equipmentIds,
      p_instructions: input.instructions,
    });
    if (result.error || typeof result.data !== "string")
      return {
        error:
          "Exercise could not be saved. Check the classifications and retry. Only your active custom exercises can be edited.",
      };
    revalidatePath("/exercises", "layout");
    return { success: "Exercise saved.", id: result.data };
  } catch {
    return {
      error:
        "Exercise could not be saved. Check your connection and sign-in, then retry.",
    };
  }
}
export async function archiveExercise(
  _state: MutationState,
  data: FormData,
): Promise<MutationState> {
  const id = data.get("id");
  if (typeof id !== "string" || !isUuid(id))
    return { error: "Invalid exercise." };
  try {
    const { client, user } = await context();
    const result = await client
      .from("exercises")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", user.id)
      .is("archived_at", null)
      .select("id");
    if (result.error || result.data?.length !== 1)
      return {
        error:
          "Exercise could not be archived. Only your own active custom exercises can be archived.",
      };
  } catch {
    return {
      error: "Archiving failed. Check your connection and sign-in, then retry.",
    };
  }
  revalidatePath("/exercises", "layout");
  redirect("/exercises?message=archived");
}
export async function setExercisePreference(
  _state: MutationState,
  data: FormData,
): Promise<MutationState> {
  const id = data.get("id"),
    kind = data.get("kind"),
    value = data.get("value");
  if (
    typeof id !== "string" ||
    !isUuid(id) ||
    !["favorite", "preference"].includes(String(kind)) ||
    (kind === "favorite"
      ? !["true", "false"].includes(String(value))
      : !["preferred", "neutral", "avoid"].includes(String(value)))
  )
    return { error: "Invalid preference." };
  try {
    const { client, user } = await context();
    const exercise = await client
      .from("exercises")
      .select("id")
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle();
    if (exercise.error || !exercise.data)
      return { error: "Exercise is not available." };
    const patch =
      kind === "favorite"
        ? { is_favorite: value === "true" }
        : { preference: String(value) };
    const existing = await client
      .from("user_exercise_preferences")
      .select("exercise_id")
      .eq("owner_id", user.id)
      .eq("exercise_id", id)
      .maybeSingle();
    if (existing.error)
      return { error: "Preference could not be loaded. Please retry." };
    if (!existing.data) {
      const insert = await client
        .from("user_exercise_preferences")
        .insert({ owner_id: user.id, exercise_id: id, ...patch });
      if (!insert.error) {
        revalidatePath("/exercises", "layout");
        return { success: "Preference saved." };
      }
      if (insert.error.code !== "23505")
        return { error: "Preference could not be saved. Please retry." };
    }
    const updated = await client
      .from("user_exercise_preferences")
      .update(patch)
      .eq("owner_id", user.id)
      .eq("exercise_id", id)
      .select("exercise_id");
    if (updated.error || updated.data.length !== 1)
      return { error: "Preference could not be saved. Please retry." };
    revalidatePath("/exercises", "layout");
    return { success: "Preference saved." };
  } catch {
    return {
      error:
        "Preference could not be saved. Check your sign-in and connection.",
    };
  }
}
