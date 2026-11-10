"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import { validDate } from "@/features/scheduling/model";
import type { LifecycleKind } from "./enrollment-model";
export async function changeProgram(
  _previous: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const kind = form.get("kind"),
    request = form.get("request"),
    assignment = form.get("assignment"),
    version = form.get("version"),
    revision = Number(form.get("revision") ?? 0),
    zone = form.get("timezone"),
    start = form.get("start");
  if (
    typeof kind !== "string" ||
    !["start", "switch", "end_now", "end_after_next", "cancel_end"].includes(
      kind,
    ) ||
    typeof request !== "string" ||
    !isUuid(request) ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    (assignment !== null &&
      (typeof assignment !== "string" || !isUuid(assignment)))
  )
    return {
      error: "Choose a valid program action and refresh its current state.",
    };
  const enrolling = kind === "start" || kind === "switch";
  if (
    enrolling &&
    (typeof version !== "string" ||
      !isUuid(version) ||
      typeof zone !== "string" ||
      zone.length > 100 ||
      !validDate(start) ||
      form.get("confirmed") !== "yes")
  )
    return { error: "Confirm the scheduling timezone and local start date." };
  if (
    (kind === "switch" || kind === "end_now") &&
    form.get("confirm_transition") !== "yes"
  )
    return {
      error:
        "Confirm this program transition. Historical workouts will be kept.",
    };
  let target: string;
  try {
    const client = await createClient(),
      identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { error: "Sign in again before changing programs." };
    const r = await client.rpc("program_lifecycle", {
      p_kind: kind as LifecycleKind,
      p_request: request,
      p_assignment: assignment ?? null,
      p_expected: revision,
      p_version: enrolling ? version : null,
      p_start: enrolling ? start : null,
      p_timezone: enrolling ? zone : null,
    });
    if (
      r.error ||
      typeof r.data?.assignmentId !== "string" ||
      !isUuid(r.data.assignmentId)
    )
      return {
        error:
          r.error?.code === "40001"
            ? "Program changed on another device. Refresh before trying again."
            : "Program was not changed. Finish or abandon any active workout, check the schedule, then refresh and retry.",
      };
    target = r.data.assignmentId;
  } catch {
    return {
      error:
        "The change could not be confirmed. Retry with the same request when connected.",
    };
  }
  for (const path of ["/dashboard", "/programs", "/workout", "/history"])
    revalidatePath(path, "layout");
  redirect(
    kind === "end_now" ? `/history/programs/${target}` : "/programs/current",
  );
}
