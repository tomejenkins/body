"use server";
import { favoriteDefaultName } from "./favorite-name";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import { validDate } from "@/features/scheduling/model";
import { decisionKinds, type SelectionState } from "./model";
function uuid(f: FormData, k: string) {
  const v = f.get(k);
  return typeof v === "string" && isUuid(v) ? v : null;
}
function integer(f: FormData, k: string) {
  const v = f.get(k);
  if (typeof v !== "string" || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
async function verified() {
  const c = await createClient();
  const u = await c.auth.getUser();
  if (u.error || !u.data.user) throw Error("Sign in required");
  return { c, user: u.data.user };
}
function refresh() {
  for (const path of ["/workout", "/programs", "/history", "/dashboard"])
    revalidatePath(path, "layout");
}
const failed =
  "Change could not be confirmed. Retry the same request, or refresh to review current state.";
export async function startSelection(
  _old: SelectionState,
  f: FormData,
): Promise<SelectionState> {
  const request = uuid(f, "request"),
    favorite = uuid(f, "favorite"),
    assignment = uuid(f, "assignment"),
    version = uuid(f, "version"),
    day = uuid(f, "day"),
    expected = integer(f, "expected"),
    revision = integer(f, "revision");
  if (
    !request ||
    (!favorite &&
      (!assignment ||
        !version ||
        !day ||
        expected === null ||
        revision === null))
  )
    return { error: "Choose a valid workout." };
  let session: string;
  try {
    const { c } = await verified();
    const r = favorite
      ? await c.rpc("start_favorite_workout", {
          p_favorite: favorite,
          p_request: request,
        })
      : await c.rpc("start_assigned_workout", {
          p_assignment: assignment,
          p_version: version,
          p_day: day,
          p_expected: expected,
          p_revision: revision,
          p_request: request,
        });
    if (r.error || typeof r.data !== "string" || !isUuid(r.data))
      return {
        error:
          r.error?.code === "40001"
            ? "Your recommendation changed. Refresh before starting."
            : "Could not start. Resume or finish any active workout, or refresh and retry.",
      };
    session = r.data;
  } catch {
    return { error: failed };
  }
  refresh();
  redirect(`/workout/${session}`);
}
export async function scheduleDecision(
  _old: SelectionState,
  f: FormData,
): Promise<SelectionState> {
  const assignment = uuid(f, "assignment"),
    version = uuid(f, "version"),
    day = uuid(f, "day"),
    request = uuid(f, "request"),
    session = uuid(f, "session"),
    expected = integer(f, "expected"),
    revision = integer(f, "revision"),
    rotation = integer(f, "rotation"),
    kind = f.get("kind"),
    date = f.get("date");
  if (
    !assignment ||
    !version ||
    !day ||
    !request ||
    expected === null ||
    revision === null ||
    rotation === null ||
    typeof kind !== "string" ||
    !decisionKinds.some((k) => k === kind) ||
    f.get("confirmed") !== "yes" ||
    (kind === "defer" && !validDate(date)) ||
    (kind === "accept_partial" && !session)
  )
    return { error: "Confirm a valid scheduling decision." };
  try {
    const { c } = await verified();
    const r = await c.rpc("decide_program_schedule", {
      p_assignment: assignment,
      p_version: version,
      p_day: day,
      p_rotation: rotation,
      p_expected: expected,
      p_revision: revision,
      p_kind: kind,
      p_request: request,
      p_session: kind === "accept_partial" ? session : null,
      p_date: kind === "defer" ? date : null,
    });
    if (r.error || !r.data)
      return {
        error:
          r.error?.code === "40001"
            ? "The schedule changed on another device. Refresh before deciding."
            : "Decision not saved. Finish any active workout and check the occurrence, partial evidence and future local date.",
      };
  } catch {
    return { error: failed };
  }
  refresh();
  return {
    success: "Scheduling decision saved. Actual workout history is unchanged.",
  };
}
export async function saveFavorite(
  _old: SelectionState,
  f: FormData,
): Promise<SelectionState> {
  const source = uuid(f, "source"),
    day = uuid(f, "day"),
    request = uuid(f, "request"),
    type = f.get("sourceType");
  if (
    !source ||
    !request ||
    !["program_day", "completed_ad_hoc"].includes(String(type)) ||
    (type === "program_day" && !day)
  )
    return { error: "Choose a valid Favorite source." };
  try {
    const { c, user } = await verified();
    let sourceName: string | null = null;
    if (type === "program_day") {
      const version = await c
        .from("program_versions")
        .select("definition")
        .eq("id", source)
        .maybeSingle();
      const days = version.data?.definition?.days;
      if (!version.error && Array.isArray(days)) {
        const selected = days.find(
          (d: { id?: string; is_rest_day?: boolean; name?: string }) =>
            d.id === day && d.is_rest_day === false,
        );
        if (typeof selected?.name === "string") sourceName = selected.name;
      }
    } else {
      const workout = await c
        .from("workout_sessions")
        .select("name")
        .eq("id", source)
        .eq("owner_id", user.id)
        .eq("status", "completed")
        .is("source_program_version_id", null)
        .is("archived_at", null)
        .maybeSingle();
      if (!workout.error && typeof workout.data?.name === "string")
        sourceName = workout.data.name;
    }
    if (sourceName === null)
      return { error: "Favorite source unavailable. Refresh and retry." };
    const r = await c.rpc("save_favorite_workout", {
      p_type: type,
      p_source: source,
      p_day: type === "program_day" ? day : null,
      p_name: favoriteDefaultName(sourceName),
      p_request: request,
    });
    if (r.error || !r.data)
      return {
        error:
          "Favorite not saved. Check source access and confirmed training; the limit is 100 favorites.",
      };
    const saved = await c
      .from("favorite_workouts")
      .select("id")
      .eq("id", r.data)
      .eq("owner_id", user.id)
      .eq("archived", false)
      .maybeSingle();
    if (saved.error || !saved.data)
      return {
        error: "Favorite is no longer saved. Refresh to review Favorites.",
      };
  } catch {
    return { error: failed };
  }
  refresh();
  return {
    success: "Saved to Favorites",
  };
}
export async function manageFavorite(
  _old: SelectionState,
  f: FormData,
): Promise<SelectionState> {
  const id = uuid(f, "favorite"),
    op = f.get("operation"),
    name = f.get("name");
  if (
    !id ||
    !["rename", "remove"].includes(String(op)) ||
    (op === "rename" &&
      (typeof name !== "string" || !name.trim() || name.trim().length > 100)) ||
    (op === "remove" && f.get("confirmed") !== "yes")
  )
    return { error: "Confirm a valid favorite change." };
  try {
    const { c, user } = await verified();
    const r = await c
      .from("favorite_workouts")
      .update(
        op === "remove" ? { archived: true } : { name: String(name).trim() },
      )
      .eq("id", id)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();
    if (r.error || !r.data)
      return { error: "Favorite could not be changed. Refresh and retry." };
  } catch {
    return { error: failed };
  }
  refresh();
  return {
    success:
      op === "remove"
        ? "Favorite removed. Existing workouts are preserved."
        : "Favorite renamed.",
  };
}
