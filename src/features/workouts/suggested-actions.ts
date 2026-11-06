"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadLibrary } from "@/features/exercises/queries";
import { isUuid } from "@/features/exercises/validation";
import { suggestedShell, type SuggestedMovement } from "./suggested-shell";
export type SuggestionState = {
  error?: string;
  needsConfirmation?: boolean;
  success?: string;
};
export async function startSuggestedWorkout(
  _: SuggestionState,
  form: FormData,
): Promise<SuggestionState> {
  const primary = form.get("primary"),
    secondary = form.get("secondary") ?? "",
    request = form.get("request");
  let id: string;
  if (
    typeof primary !== "string" ||
    typeof secondary !== "string" ||
    typeof request !== "string" ||
    !isUuid(request)
  )
    return { error: "Choose a muscle group." };
  try {
    const client = await createClient();
    const u = await client.auth.getUser();
    if (!u.data.user || u.error) return { error: "Sign in again." };
    const l = await loadLibrary();
    const slots = suggestedShell(
      primary,
      secondary,
      l.exercises,
      l.patterns,
      l.muscles,
    );
    if (!slots.length)
      return {
        error:
          "No supported movement suggestions for this group yet. Start blank and add exercises instead.",
      };
    const r = await client.rpc("start_suggested_workout", {
      p_slots: slots,
      p_request: request,
    });
    if (r.error || typeof r.data !== "string" || !isUuid(r.data))
      return {
        error:
          "Could not start. Resume an active workout or refresh and retry.",
      };
    id = r.data;
  } catch (e) {
    return {
      error:
        e instanceof Error && /Choose/.test(e.message)
          ? e.message
          : "Start could not be confirmed. Retry the same request.",
    };
  }
  revalidatePath("/workout", "layout");
  redirect(`/workout/${id}`);
}
export async function editSuggestedMovement(
  _: SuggestionState,
  form: FormData,
): Promise<SuggestionState> {
  const session = form.get("session"),
    request = form.get("request"),
    remove = form.get("remove"),
    choice = form.get("choice");
  if (
    typeof session !== "string" ||
    !isUuid(session) ||
    typeof request !== "string" ||
    !isUuid(request) ||
    (remove && (typeof remove !== "string" || !isUuid(remove)))
  )
    return { error: "Check the movement." };
  try {
    const client = await createClient();
    const u = await client.auth.getUser();
    if (!u.data.user || u.error) return { error: "Sign in again." };
    let slot: SuggestedMovement | null = null;
    if (typeof choice === "string" && choice) {
      const l = await loadLibrary();
      // All supported pairs may be deliberately added; initial shells use only two.
      const options = allMovementOptions(l);
      slot = options.find((s) => movementKey(s) === choice) ?? null;
      if (!slot) return { error: "Choose a supported movement." };
    }
    if (!slot && !remove) return { error: "Choose a movement." };
    const r = await client.rpc("edit_suggested_movement", {
      p_session: session,
      p_request: request,
      p_slot: slot,
      p_remove: remove || null,
      p_keep: form.get("keep") === "yes",
    });
    if (r.error?.code === "P0001")
      return {
        needsConfirmation: true,
        error: "Keep recorded work and add the changed movement?",
      };
    if (r.error || !r.data)
      return {
        error: "Movement not changed. Refresh to check the workout status.",
      };
    revalidatePath("/workout", "layout");
    return { success: slot ? "Movement added." : "Movement removed." };
  } catch {
    return { error: "Change could not be confirmed. Retry the same request." };
  }
}
// Imported from a separate pure module below to keep server-action exports async.
import { allMovementOptions, movementKey } from "./suggested-shell";
