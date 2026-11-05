"use server";
import { validEffort, type EffortScale } from "./effort";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import {
  setTypes,
  type LoggedSet,
  type SetCommand,
  type SetResult,
  type WeightUnit,
} from "./model";
export async function mutateSet(input: SetCommand): Promise<SetResult> {
  if (
    (input.effort !== undefined &&
      (!validEffort(input.effort) ||
        (input.type === "warm_up" && input.effort.failure))) ||
    !isUuid(input.itemId) ||
    !isUuid(input.id) ||
    !isUuid(input.mutation) ||
    !["add", "save", "move", "remove"].includes(input.operation) ||
    !Object.hasOwn(setTypes, input.type) ||
    !["external", "bodyweight"].includes(input.mode) ||
    typeof input.completed !== "boolean" ||
    (input.operation !== "add" &&
      (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0)) ||
    (input.reps !== null &&
      (!Number.isInteger(input.reps) || input.reps < 0 || input.reps > 1000)) ||
    (input.weight !== null &&
      (!/^\d+(\.\d{1,3})?$/.test(input.weight) ||
        Number(input.weight) > 100000)) ||
    (input.enteredWeight != null &&
      (!/^\d{1,6}(\.\d{1,6})?$/.test(input.enteredWeight) ||
        !["kg", "lb"].includes(String(input.enteredUnit)))) ||
    (input.enteredWeight == null) !== (input.enteredUnit == null) ||
    (input.operation === "move" && ![-1, 1].includes(Number(input.direction)))
  )
    return { error: "Check set values and retry." };
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { error: "Sign in again before saving." };
    const result = await client.rpc("log_workout_set", {
      p_item: input.itemId,
      p_id: input.id,
      p_operation: input.operation,
      p_revision: input.revision,
      p_mutation: input.mutation,
      p_reps: input.reps,
      p_weight: input.weight,
      p_type: input.type,
      p_mode: input.mode,
      p_completed: input.completed,
      p_direction: input.direction ?? null,
      p_entered_weight: input.enteredWeight ?? null,
      p_entered_unit: input.enteredUnit ?? null,
      p_effort: input.effort ?? null,
    });
    if (result.error) {
      if (result.error.code === "40001") {
        const current = await client
          .from("workout_sets")
          .select("*")
          .eq("owner_id", identity.data.user.id)
          .eq("workout_exercise_id", input.itemId)
          .order("position")
          .returns<LoggedSet[]>();
        return {
          error:
            "This set changed elsewhere. Review the saved values before retrying your edits.",
          conflict: true,
          rows: current.error ? undefined : current.data,
        };
      }
      return {
        error:
          "Set not saved. Check your values and connection; closed or removed selections cannot be edited.",
      };
    }
    if (!Array.isArray(result.data) || result.data.length === 0)
      return {
        error:
          "This workout closed before the edit could be saved. Your draft is retained for review.",
      };
    return { rows: result.data as LoggedSet[] };
  } catch {
    return {
      error:
        "Save could not be confirmed. Your draft is retained; retry when connected.",
    };
  }
}
export async function saveWeightUnit(
  unit: WeightUnit,
): Promise<{ error?: string }> {
  if (!["kg", "lb"].includes(unit)) return { error: "Invalid unit." };
  try {
    const client = await createClient();
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) return { error: "Sign in again." };
    const result = await client
      .from("account_preferences")
      .update({ display_weight_unit: unit })
      .eq("owner_id", user.data.user.id)
      .select("owner_id");
    if (result.error || result.data.length !== 1)
      return { error: "Unit preference was not saved. Retry." };
    revalidatePath("/workout", "layout");
    revalidatePath("/profile");
    revalidatePath("/history", "layout");
    revalidatePath("/exercises", "layout");
    return {};
  } catch {
    return { error: "Unit preference could not be saved." };
  }
}

export async function readSetRows(itemId: string): Promise<SetResult> {
  if (!isUuid(itemId)) return { error: "Invalid selection." };
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { error: "Sign in again." };
    const result = await client
      .from("workout_sets")
      .select("*")
      .eq("workout_exercise_id", itemId)
      .eq("owner_id", identity.data.user.id)
      .order("position")
      .returns<LoggedSet[]>();
    return result.error
      ? {
          error:
            "Saved values could not be loaded. Your draft is still retained.",
        }
      : { rows: result.data };
  } catch {
    return { error: "Saved values could not be loaded. Retry when connected." };
  }
}

export async function saveEffortPreference(
  scale: EffortScale,
): Promise<{ error?: string }> {
  if (!["rpe", "rir"].includes(scale)) return { error: "Choose RPE or RIR." };
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { error: "Sign in again." };
    const result = await client
      .from("account_preferences")
      .update({ preferred_effort_scale: scale })
      .eq("owner_id", identity.data.user.id)
      .select("owner_id");
    if (result.error || result.data?.length !== 1)
      return { error: "Effort preference was not saved. Retry." };
    revalidatePath("/profile");
    revalidatePath("/workout", "layout");
    return {};
  } catch {
    return { error: "Effort preference could not be saved." };
  }
}
