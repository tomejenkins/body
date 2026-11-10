"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
export async function changeWorkoutRetention(
  _previous: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const session = form.get("session"),
    request = form.get("request"),
    kind = form.get("kind"),
    revision = Number(form.get("revision"));
  if (
    typeof session !== "string" ||
    !isUuid(session) ||
    typeof request !== "string" ||
    !isUuid(request) ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof kind !== "string" ||
    !["archive", "restore", "delete"].includes(kind) ||
    form.get("confirmed") !== "yes"
  )
    return {
      error: "Confirm this action on the current workout before continuing.",
    };
  try {
    const client = await createClient(),
      identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { error: "Sign in again before managing this workout." };
    const result = await client.rpc("retain_workout", {
      p_session: session,
      p_kind: kind,
      p_request: request,
      p_expected: revision,
    });
    if (
      result.error ||
      result.data?.sessionId !== session ||
      result.data?.kind !== kind
    )
      return {
        error:
          result.error?.code === "40001"
            ? "This workout changed on another device. Refresh before trying again."
            : "The change was not confirmed. Refresh to check this workout, then retry.",
      };
  } catch {
    return {
      error:
        "The change could not be confirmed. Retry with the same request when connected.",
    };
  }
  for (const path of [
    "/history",
    "/exercises",
    "/dashboard",
    "/programs",
    "/workout",
    "/profile",
  ])
    revalidatePath(path, "layout");
  redirect(
    kind === "delete" ? "/history?message=deleted" : `/history/${session}`,
  );
}
