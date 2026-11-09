import "server-only";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dateOffset, type Schedule } from "./model";
import {
  requestedWeek,
  trainingEvents,
  type WeekTraining,
} from "./training-week";
export async function loadTrainingWeek(week?: unknown) {
  const user = await requireUser("/dashboard"),
    client = await createClient({ readOnly: true });
  const result = await client.rpc("program_schedule", {
    p_from: requestedWeek(week),
    p_days: 7,
  });
  if (result.error)
    throw Error("Your training calendar could not be loaded. Please retry.");
  const schedule = result.data as Schedule | null;
  if (
    !schedule?.configured ||
    !schedule.from ||
    !schedule.until ||
    !schedule.timezone
  )
    return { schedule, events: [], truncated: false };
  // A padded UTC range includes every IANA local boundary, including DST. Final membership uses the assignment zone.
  const history = await client
    .from("workout_sessions")
    .select("id,name,finished_at,completion_status,program_assignment_id")
    .eq("owner_id", user.id)
    .eq("status", "completed")
    .or(
      `program_assignment_id.is.null,program_assignment_id.neq.${schedule.assignmentId}`,
    )
    .in("completion_status", ["full", "partial"])
    .gte("finished_at", `${dateOffset(schedule.from, -1)}T00:00:00Z`)
    .lt("finished_at", `${dateOffset(schedule.until, 1)}T00:00:00Z`)
    .order("finished_at", { ascending: false })
    .order("id")
    .limit(201)
    .returns<WeekTraining[]>();
  if (history.error || !history.data)
    throw Error("Your weekly training could not be loaded. Please retry.");
  return {
    schedule,
    events: trainingEvents(schedule, history.data.slice(0, 200)),
    truncated: history.data.length > 200,
  };
}
