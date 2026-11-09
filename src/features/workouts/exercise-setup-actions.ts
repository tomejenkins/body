"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import type { SuggestionState } from "./suggested-actions";
export async function startExerciseWorkout(
  _: SuggestionState,
  form: FormData,
): Promise<SuggestionState> {
  const ids = form.getAll("exercise"),
    request = form.get("request");
  if (
    typeof request !== "string" ||
    !isUuid(request) ||
    ids.length < 1 ||
    ids.length > 6 ||
    ids.some((id) => typeof id !== "string" || !isUuid(id)) ||
    new Set(ids).size !== ids.length
  )
    return { error: "Choose one to six different exercises." };
  let id: string;
  try {
    const client = await createClient(),
      user = await client.auth.getUser();
    if (user.error || !user.data.user) return { error: "Sign in again." };
    const result = await client.rpc("start_exercise_workout", {
      p_exercises: ids,
      p_request: request,
    });
    if (result.error || typeof result.data !== "string" || !isUuid(result.data))
      return {
        error:
          "Could not start. Resume an active workout or refresh and retry.",
      };
    id = result.data;
  } catch {
    return { error: "Start could not be confirmed. Retry the same request." };
  }
  revalidatePath("/workout", "layout");
  revalidatePath("/dashboard");
  redirect(`/workout/${id}`);
}
