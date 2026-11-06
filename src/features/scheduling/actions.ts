"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import { validDate } from "./model";
export async function configureSchedule(
  _previous: { error?: string; saved?: boolean },
  form: FormData,
): Promise<{ error?: string; saved?: boolean }> {
  const assignment = form.get("assignment"),
    zone = form.get("timezone"),
    start = form.get("start"),
    request = form.get("request");
  if (
    typeof zone !== "string" ||
    zone.length > 100 ||
    form.get("confirmed") !== "yes" ||
    typeof request !== "string" ||
    !isUuid(request) ||
    (assignment &&
      (typeof assignment !== "string" ||
        !isUuid(assignment) ||
        !validDate(start)))
  )
    return { error: "Confirm a valid timezone and local start date." };
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { error: "Sign in again to configure scheduling." };
    const valid = await client.rpc("valid_scheduling_timezone", {
      p_zone: zone,
    });
    if (valid.error || !valid.data)
      return {
        error: "Choose a supported IANA timezone, such as Europe/London.",
      };
    const result = assignment
      ? await client.rpc("configure_program_schedule", {
          p_assignment: assignment,
          p_start: start,
          p_timezone: zone,
          p_request: request,
        })
      : await client
          .from("account_preferences")
          .update({ scheduling_timezone: zone })
          .eq("owner_id", identity.data.user.id)
          .select("owner_id")
          .maybeSingle();
    if (result.error || !result.data)
      return {
        error:
          "Schedule could not be configured. Use today or a future date; reload if it was configured elsewhere.",
      };
  } catch {
    return {
      error:
        "Configuration could not be confirmed. Retry with the same request when connected.",
    };
  }
  revalidatePath("/programs");
  return { saved: true };
}
