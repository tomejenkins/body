"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import type { WorkoutState } from "./types";
async function verifiedClient() {
  const client = await createClient();
  const identity = await client.auth.getUser();
  if (identity.error || !identity.data.user)
    throw new Error("Sign in required");
  return client;
}
function id(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" && isUuid(value) ? value : null;
}
function refresh() {
  revalidatePath("/workout", "layout");
  revalidatePath("/history", "layout");
  revalidatePath("/exercises", "layout");
}
export async function startWorkout(): Promise<WorkoutState> {
  let workoutId: string;
  try {
    const client = await verifiedClient();
    const result = await client.rpc("start_ad_hoc_workout");
    if (result.error || typeof result.data !== "string" || !isUuid(result.data))
      return {
        error:
          "Your workout could not start. Please retry; an existing active workout will be resumed.",
      };
    workoutId = result.data;
  } catch {
    return { error: "Check your connection and sign-in, then try again." };
  }
  refresh();
  redirect(`/workout/${workoutId}`);
}
export async function editWorkout(
  _previous: WorkoutState,
  data: FormData,
): Promise<WorkoutState> {
  const session = id(data, "sessionId"),
    operation = data.get("operation"),
    exercise = id(data, "exerciseId"),
    item = id(data, "itemId"),
    direction = data.get("direction");
  if (
    !session ||
    !["add", "remove", "move"].includes(String(operation)) ||
    (operation === "add" ? !exercise : !item) ||
    (operation === "move" && !["-1", "1"].includes(String(direction)))
  )
    return { error: "Check the workout selection and retry." };
  try {
    const client = await verifiedClient();
    const result = await client.rpc("edit_workout", {
      p_session: session,
      p_operation: operation,
      p_exercise: exercise,
      p_item: item,
      p_direction: operation === "move" ? Number(direction) : null,
    });
    if (result.error)
      return {
        error:
          "The selection could not be changed. Refresh and retry. Finished workouts and logged selections are protected.",
      };
    refresh();
    return {
      success:
        operation === "add"
          ? "Exercise selected."
          : operation === "remove"
            ? "Exercise removed."
            : "Exercise order updated.",
      itemId: typeof result.data === "string" ? result.data : undefined,
    };
  } catch {
    return { error: "Check your connection and sign-in, then retry." };
  }
}
export async function endWorkout(
  _previous: WorkoutState,
  data: FormData,
): Promise<WorkoutState> {
  const session = id(data, "sessionId"),
    outcome = data.get("outcome");
  if (!session || !["completed", "abandoned"].includes(String(outcome)))
    return { error: "Invalid workout transition." };
  try {
    const client = await verifiedClient();
    const result = await client.rpc("end_workout", {
      p_session: session,
      p_outcome: outcome,
    });
    if (result.error)
      return {
        error:
          "Your workout could not be closed. Refresh to check its current state, then retry.",
      };
  } catch {
    return { error: "Check your connection and sign-in, then retry." };
  }
  refresh();
  redirect(`/workout?message=${outcome}`);
}
