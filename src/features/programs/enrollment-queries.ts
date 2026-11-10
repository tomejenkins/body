import "server-only";
import { cache } from "react";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import { pageCursor, type HistorySummary } from "@/features/history/model";
import type { Enrollment } from "./enrollment-model";
import type { WeightUnit } from "@/features/sets/model";
export const loadEnrollmentContext = cache(async () => {
  const user = await requireUser("/programs"),
    client = await createClient({ readOnly: true });
  const [active, session, preference] = await Promise.all([
    client
      .from("program_assignments")
      .select("id")
      .eq("owner_id", user.id)
      .eq("state", "active")
      .maybeSingle<{ id: string }>(),
    client
      .from("workout_sessions")
      .select("id")
      .eq("owner_id", user.id)
      .eq("status", "in_progress")
      .maybeSingle<{ id: string }>(),
    client
      .from("account_preferences")
      .select("scheduling_timezone,display_weight_unit")
      .eq("owner_id", user.id)
      .single<{
        scheduling_timezone: string | null;
        display_weight_unit: WeightUnit;
      }>(),
  ]);
  if (active.error || session.error || preference.error || !preference.data)
    throw Error("Program status could not be loaded. Please retry.");
  let enrollment: Enrollment | null = null;
  if (active.data) {
    const r = await client.rpc("program_enrollment_history", {
      p_assignment: active.data.id,
    });
    if (r.error || r.data?.length !== 1)
      throw Error("Program statistics could not be loaded.");
    enrollment = r.data[0] as Enrollment;
  }
  return {
    enrollment,
    activeSession: session.data?.id ?? null,
    timezone: preference.data.scheduling_timezone,
    unit: preference.data.display_weight_unit,
  };
});
export async function loadEnrollmentHistory(cursor: unknown) {
  await requireUser("/history/programs");
  const client = await createClient({ readOnly: true }),
    p = pageCursor(cursor);
  const r = await client.rpc("program_enrollment_history", {
    p_before: p?.before ?? null,
    p_before_id: p?.beforeId ?? null,
    p_limit: 11,
  });
  if (r.error || !Array.isArray(r.data))
    throw Error("Program History could not be loaded. Please retry.");
  return {
    items: (r.data as Enrollment[]).slice(0, 10),
    hasMore: r.data.length > 10,
  };
}
export async function loadEnrollment(id: string, cursor: unknown) {
  if (!isUuid(id)) return null;
  await requireUser(`/history/programs/${id}`);
  const client = await createClient({ readOnly: true }),
    p = pageCursor(cursor);
  const a = await client.rpc("program_enrollment_history", {
    p_assignment: id,
  });
  if (a.error) throw Error("Program History could not be loaded.");
  if (!a.data?.length) return null;
  const w = await client.rpc("program_history_workouts", {
    p_assignment: id,
    p_before: p?.before ?? null,
    p_before_id: p?.beforeId ?? null,
    p_limit: 21,
  });
  if (w.error || !Array.isArray(w.data))
    throw Error("Assigned workouts could not be loaded.");
  return {
    enrollment: a.data[0] as Enrollment,
    workouts: (
      w.data as Pick<
        HistorySummary,
        | "id"
        | "name"
        | "status"
        | "completion_status"
        | "started_at"
        | "finished_at"
        | "working_sets"
      >[]
    ).slice(0, 20),
    hasMore: w.data.length > 20,
  };
}
export async function loadEnrollmentVersion(id: unknown) {
  if (typeof id !== "string" || !isUuid(id)) return null;
  await requireUser("/programs");
  const client = await createClient({ readOnly: true });
  const r = await client
    .from("program_versions")
    .select("id,program_id,definition,version")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      program_id: string;
      definition: { program: { name: string } };
      version: number;
    }>();
  if (r.error) throw Error("Program version could not be loaded.");
  if (!r.data) return null;
  const root = await client
    .from("programs")
    .select("id")
    .eq("id", r.data.program_id)
    .is("archived_at", null)
    .maybeSingle();
  if (root.error) throw Error("Program availability could not be loaded.");
  return root.data ? r.data : null;
}
