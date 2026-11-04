import "server-only";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import type { WeightUnit } from "@/features/sets/model";
import { featuredLifts, prioritizedRecordIds } from "./prominence";
import {
  selectAchievements,
  type ExerciseRecords,
  type RecordMetric,
  type Achievement,
} from "./model";
export async function loadRecords(search: unknown, cursor: unknown) {
  const user = await requireUser("/history/records");
  const client = await createClient({ readOnly: true });
  const q = typeof search === "string" ? search.slice(0, 120) : "";
  const after = typeof cursor === "string" && isUuid(cursor) ? cursor : null;
  const [featured, other, preferences] = await Promise.all([
    client.rpc("personal_records", {
      p_ids: featuredLifts.map((f) => f.id),
      p_limit: 3,
    }),
    client.rpc("personal_records", {
      p_search: q,
      p_after: after,
      p_limit: 21,
      p_prioritized: prioritizedRecordIds(),
      p_exclude: featuredLifts.map((f) => f.id),
    }),
    client
      .from("account_preferences")
      .select("display_weight_unit")
      .eq("owner_id", user.id)
      .single<{ display_weight_unit: WeightUnit }>(),
  ]);
  if (featured.error || other.error || preferences.error)
    throw new Error("Personal records could not be loaded. Please retry.");
  const rows = other.data as ExerciseRecords[];
  return {
    featured: featured.data as ExerciseRecords[],
    rows: rows.slice(0, 20),
    hasMore: rows.length > 20,
    unit: preferences.data.display_weight_unit,
    query: q,
  };
}
export async function loadExerciseRecords(id: string, cursor: unknown) {
  await requireUser(`/exercises/${id}/history`);
  const client = await createClient({ readOnly: true });
  let category: string | null = null,
    weight: string | null = null;
  if (typeof cursor === "string") {
    const [c, w] = cursor.split("|");
    if (
      ["added", "loaded"].includes(c) &&
      /^\d+(\.\d{1,3})?$/.test(w) &&
      Number(w) > 0 &&
      Number(w) <= 100000
    ) {
      category = c;
      weight = w;
    }
  }
  const [records, loads] = await Promise.all([
    client.rpc("personal_records", { p_ids: [id], p_limit: 1 }),
    client.rpc("record_load_bests", {
      p_exercise: id,
      p_before: weight,
      p_category: category,
      p_limit: 11,
    }),
  ]);
  if (records.error || loads.error)
    throw new Error("Exercise records could not be loaded. Please retry.");
  const rows = loads.data as RecordMetric[];
  return {
    record: (records.data as ExerciseRecords[])[0] ?? null,
    loads: rows.slice(0, 10),
    hasMore: rows.length > 10,
  };
}
export async function loadAchievements(id: unknown) {
  if (typeof id !== "string" || !isUuid(id)) return [];
  await requireUser("/history");
  const client = await createClient({ readOnly: true });
  const result = await client.rpc("workout_achievements", { p_session: id });
  if (result.error)
    throw new Error("Workout achievements could not be loaded. Please retry.");
  return selectAchievements(result.data as Achievement[]);
}
