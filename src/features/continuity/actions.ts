"use server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import type { Continuity } from "./model";
export async function readWorkoutContinuity(
  session?: string,
): Promise<{ data: Continuity | null; error?: string }> {
  if (session !== undefined && !isUuid(session))
    return { data: null, error: "Invalid workout." };
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { data: null, error: "Sign in again to review your workout." };
    const result = await client.rpc("workout_continuity", {
      p_session: session ?? null,
    });
    return result.error
      ? {
          data: null,
          error: "Workout status could not be confirmed. Please retry.",
        }
      : { data: result.data as Continuity | null };
  } catch {
    return {
      data: null,
      error: "Workout status could not be confirmed. Check your connection.",
    };
  }
}
export async function continueWorkout(
  session: string,
  nonce: string,
): Promise<{ data: Continuity | null; error?: string }> {
  if (!isUuid(session) || !isUuid(nonce))
    return { data: null, error: "Invalid workout continuation." };
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { data: null, error: "Sign in again to continue." };
    const result = await client.rpc("workout_continuity", {
      p_session: session,
      p_resume_nonce: nonce,
    });
    if (result.error || !result.data)
      return {
        data: null,
        error: "Workout could not continue. Reload its saved state.",
      };
    const data = result.data as Continuity;
    return data.status === "in_progress"
      ? { data }
      : {
          data,
          error:
            "This workout is already closed. Your saved work is preserved.",
        };
  } catch {
    return {
      data: null,
      error: "Continuation could not be confirmed. Retry when connected.",
    };
  }
}
export async function finishCheckIn(
  session: string,
  outcome: "completed" | "abandoned",
): Promise<{ data: Continuity | null; error?: string }> {
  if (!isUuid(session) || !["completed", "abandoned"].includes(outcome))
    return { data: null, error: "Invalid workout closure." };
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { data: null, error: "Sign in again to close this workout." };
    const result = await client.rpc("end_workout", {
      p_session: session,
      p_outcome: outcome,
    });
    if (result.error)
      return {
        data: null,
        error: "Workout could not be closed. Reload its saved state.",
      };
    const saved = await client.rpc("workout_continuity", {
      p_session: session,
    });
    if (saved.error || !saved.data)
      return {
        data: null,
        error: "Closure could not be confirmed. Reload before retrying.",
      };
    return { data: saved.data as Continuity };
  } catch {
    return {
      data: null,
      error: "Closure could not be confirmed. Your saved sets are preserved.",
    };
  }
}
