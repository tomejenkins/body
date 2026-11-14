"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validCardio, type CardioCommand, type CardioItem } from "./model";
export async function recordCardio(
  command: CardioCommand,
): Promise<{ items?: CardioItem[]; error?: string; conflict?: boolean }> {
  if (!validCardio(command))
    return {
      error: "Choose an activity and a duration between 1 second and 24 hours.",
    };
  try {
    const c = await createClient(),
      user = await c.auth.getUser();
    if (user.error || !user.data.user)
      return { error: "Sign in again before saving cardio." };
    const r = await c.rpc("record_workout_cardio", {
      p_session: command.session,
      p_item: command.item,
      p_operation: command.operation,
      p_expected: command.expected,
      p_activity: command.activity,
      p_seconds: command.seconds,
      p_request: command.request,
    });
    if (r.error?.code === "P7701")
      return {
        error:
          "Training access is required. Your saved work and drafts are preserved. View Access Options in Profile.",
      };
    if (r.error)
      return {
        error:
          r.error.code === "40001"
            ? "Cardio changed on another device. Refresh before editing."
            : "Cardio was not saved. Refresh if the workout closed, then retry.",
        conflict: r.error.code === "40001",
      };
    if (!Array.isArray(r.data?.items))
      return { error: "Save could not be confirmed. Retry the same values." };
    for (const path of [
      `/workout/${command.session}`,
      `/workout/${command.session}/complete`,
      `/history/${command.session}`,
      "/history",
      "/dashboard",
    ])
      revalidatePath(path);
    return { items: r.data.items };
  } catch {
    return {
      error:
        "Save could not be confirmed. Retry the same values when connected.",
    };
  }
}
