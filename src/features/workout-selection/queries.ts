import "server-only";
import { cache } from "react";
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

// React cache deduplicates only this server-render request, never across owners.
export const loadSavedFavoriteKeys = cache(async () => {
  const user = await requireUser("/workout");
  const client = await createClient({ readOnly: true });
  const result = await client
    .from("favorite_workouts")
    .select("source_type,source_key")
    .eq("owner_id", user.id)
    .eq("archived", false)
    .limit(100);
  if (result.error)
    throw Error("Favorites could not be checked. Please retry.");
  return new Set(
    (result.data ?? []).map((f) => `${f.source_type}:${f.source_key}`),
  );
});
