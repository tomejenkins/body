import "server-only";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { StartOptions } from "./model";
export async function loadStartOptions(): Promise<StartOptions> {
  await requireUser("/workout");
  const client = await createClient({ readOnly: true });
  const result = await client.rpc("workout_start_options");
  if (result.error || !result.data)
    throw Error("Workout choices could not be loaded. Please retry.");
  return result.data as StartOptions;
}
