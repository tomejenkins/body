import "server-only";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { validDate, type Schedule } from "./model";
export async function loadProgramSchedule(week?: unknown) {
  const user = await requireUser("/programs");
  const client = await createClient({ readOnly: true });
  const [schedule, preference] = await Promise.all([
    client.rpc("program_schedule", {
      p_from: validDate(week) ? week : null,
      p_days: 7,
    }),
    client
      .from("account_preferences")
      .select("scheduling_timezone")
      .eq("owner_id", user.id)
      .single<{ scheduling_timezone: string | null }>(),
  ]);
  if (schedule.error || preference.error)
    throw Error("Your program calendar could not be loaded. Please retry.");
  return {
    schedule: schedule.data as Schedule | null,
    timezone: preference.data.scheduling_timezone,
  };
}
