import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import type { Workout } from "@/features/workouts/types";
import { loadAchievementSummary } from "@/features/records/queries";
import {
  loadProgramOutcomes,
  loadProgressionSuggestions,
} from "@/features/programs/progression-queries";
import { loadTrainingSummary } from "./statistics";
import { favoriteSource } from "./model";
type Favorite = {
  id: string;
  name: string;
  source_type: string;
  source_key: string;
};
export async function loadCompletion(w: Workout) {
  const user = await requireUser(`/workout/${w.id}/complete`);
  if (user.id !== w.userId || w.status !== "completed")
    throw Error("Completed workout required.");
  const client = await createClient({ readOnly: true });
  const [statistics, achievements, outcomes, suggestions, favorites] =
    await Promise.all([
      loadTrainingSummary(w.id),
      loadAchievementSummary(w.id),
      loadProgramOutcomes(w),
      loadProgressionSuggestions(w),
      client
        .from("favorite_workouts")
        .select("id,name,source_type,source_key")
        .eq("owner_id", user.id)
        .eq("archived", false)
        .order("id")
        .limit(100)
        .returns<Favorite[]>(),
    ]);
  if (favorites.error || !favorites.data)
    throw Error("Favorite status could not be loaded. Please retry.");
  const source = favoriteSource(w),
    saved = favorites.data.find(
      (f) =>
        f.id === w.favoriteId ||
        (f.source_type === source.type && f.source_key === source.key),
    );
  return {
    statistics,
    achievements,
    outcomes,
    suggestions,
    favorite: {
      source,
      saved: saved ? { id: saved.id, name: saved.name } : null,
      atCapacity: favorites.data.length >= 100,
      eligible: source.type === "program_day" || statistics.working_sets > 0,
    },
  };
}
