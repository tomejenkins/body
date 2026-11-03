import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import type {
  Exercise,
  ExerciseType,
  Library,
  Preference,
  Taxon,
} from "./types";
type Row = {
  id: string;
  slug: string;
  name: string;
  owner_id: string | null;
  exercise_type: ExerciseType;
  instructions: string | null;
  archived_at: string | null;
  exercise_movement_patterns: {
    movement_pattern_id: string;
    is_primary: boolean;
  }[];
  exercise_muscles: { muscle_group_id: string; muscle_role: string }[];
  exercise_equipment: { equipment_type_id: string }[];
};
async function allRows<T>(
  page: (
    start: number,
    end: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const result: T[] = [];
  for (let from = 0; ; from += 500) {
    const response = await page(from, from + 499);
    if (response.error || !response.data)
      throw new Error("Exercise data could not be loaded.");
    result.push(...response.data);
    if (response.data.length < 500) return result;
  }
}
export async function loadLibrary(): Promise<Library> {
  const user = await requireUser("/exercises");
  const client = await createClient({ readOnly: true });
  const [rows, patterns, muscles, equipment, preferences, available, recents] =
    await Promise.all([
      allRows((from, to) =>
        client
          .from("exercises")
          .select(
            "id,slug,name,owner_id,exercise_type,instructions,archived_at,exercise_movement_patterns(movement_pattern_id,is_primary),exercise_muscles(muscle_group_id,muscle_role),exercise_equipment(equipment_type_id)",
          )
          .is("archived_at", null)
          .order("id")
          .range(from, to)
          .returns<Row[]>(),
      ),
      allRows((from, to) =>
        client
          .from("movement_patterns")
          .select("id,slug,name")
          .is("archived_at", null)
          .order("name")
          .range(from, to)
          .returns<Taxon[]>(),
      ),
      allRows((from, to) =>
        client
          .from("muscle_groups")
          .select("id,slug,name")
          .is("archived_at", null)
          .order("name")
          .range(from, to)
          .returns<Taxon[]>(),
      ),
      allRows((from, to) =>
        client
          .from("equipment_types")
          .select("id,slug,name")
          .is("archived_at", null)
          .order("name")
          .range(from, to)
          .returns<Taxon[]>(),
      ),
      allRows((from, to) =>
        client
          .from("user_exercise_preferences")
          .select("exercise_id,is_favorite,preference")
          .eq("owner_id", user.id)
          .order("exercise_id")
          .range(from, to)
          .returns<
            {
              exercise_id: string;
              is_favorite: boolean;
              preference: Preference["preference"];
            }[]
          >(),
      ),
      client
        .from("user_equipment")
        .select("equipment_type_id")
        .eq("owner_id", user.id),
      client
        .from("workout_exercises")
        .select("exercise_id")
        .is("removed_at", null)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(200),
    ]);
  if (available.error || recents.error)
    throw new Error("Your exercise context could not be loaded.");
  const exercises: Exercise[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    ownerId: r.owner_id,
    exerciseType: r.exercise_type,
    instructions: r.instructions,
    archivedAt: r.archived_at,
    primaryPatternId:
      r.exercise_movement_patterns.find((p) => p.is_primary)
        ?.movement_pattern_id ?? null,
    secondaryPatternIds: r.exercise_movement_patterns
      .filter((p) => !p.is_primary)
      .map((p) => p.movement_pattern_id),
    primaryMuscleIds: r.exercise_muscles
      .filter((m) => m.muscle_role === "primary")
      .map((m) => m.muscle_group_id),
    secondaryMuscleIds: r.exercise_muscles
      .filter((m) => m.muscle_role === "secondary")
      .map((m) => m.muscle_group_id),
    equipmentIds: r.exercise_equipment.map((e) => e.equipment_type_id),
  }));
  return {
    userId: user.id,
    exercises,
    patterns,
    muscles,
    equipment,
    preferences: preferences.map((p) => ({
      exerciseId: p.exercise_id,
      isFavorite: p.is_favorite,
      preference: p.preference,
    })),
    availableEquipmentIds: available.data.map((e) => e.equipment_type_id),
    recentIds: [...new Set(recents.data.map((e) => e.exercise_id))],
  };
}
