import "server-only";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import type {
  CatalogFilters,
  CatalogPage,
  ProgramTag,
  ProgramMedia,
} from "./catalog";
export async function loadProgramCatalog(
  filters: CatalogFilters,
): Promise<CatalogPage> {
  await requireUser("/programs");
  const client = await createClient({ readOnly: true });
  const { data, error } = await client.rpc("program_catalog", {
    p_query: filters.q,
    p_page: filters.page,
    p_goal: filters.goal,
    p_split: filters.split,
    p_experience: filters.experience,
    p_equipment: filters.equipment,
    p_frequency: filters.frequency,
    p_style: filters.style,
  });
  if (error || !data || !Array.isArray(data.items))
    throw Error("Program library could not be loaded. Please retry.");
  return data as CatalogPage;
}
export type Prescription = {
  position: number;
  set_type: string;
  reps_min: number | null;
  reps_max: number | null;
  effort_scale: string | null;
  effort_value: number | null;
  intended_to_failure: boolean;
  rest_seconds: number | null;
};
export type ProgramSlot = {
  id: string;
  position: number;
  exercise_id: string;
  movement_pattern_id: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number | null;
  rest_seconds_max: number | null;
  progression_rule_id: string;
  notes: string | null;
  alternatives: { exercise_id: string; position: number }[];
  sets: Prescription[];
};
export type ProgramDay = {
  id: string;
  cycle_position: number;
  name: string;
  is_rest_day: boolean;
  focus: string | null;
  notes: string | null;
  slots: ProgramSlot[];
};
export type ProgramDefinition = {
  schema_version: number;
  program: {
    id: string;
    name: string;
    summary: string;
    description_markdown: string;
    cycle_length: number;
    objective: string;
    experience_level: string;
    sessions_min: number;
    sessions_max: number;
    session_minutes_min: number;
    session_minutes_max: number;
    duration_rotations: number | null;
  };
  days: ProgramDay[];
  equipment: string[];
  rules: {
    id: string;
    strategy: string;
    load_step_kg: number | null;
    reps_min: number | null;
    reps_max: number | null;
  }[];
  tags: ProgramTag[];
  media: { cover: ProgramMedia | null; gallery: ProgramMedia[] };
  publisher?: { name: string };
};
export async function loadOfficialProgram(id: string) {
  await requireUser("/programs");
  if (!isUuid(id)) return null;
  const client = await createClient({ readOnly: true });
  const root = await client
    .from("programs")
    .select("published_version_id,first_published_at,featured")
    .eq("id", id)
    .eq("owner_id", "6ab9fb82-8aae-5e49-9f9d-535b4a25d302")
    .eq("publisher_id", "6ab9fb82-8aae-5e49-9f9d-535b4a25d302")
    .eq("is_template", true)
    .eq("visibility", "public")
    .eq("origin", "body_authored")
    .eq("publication_status", "published")
    .eq("publication_eligibility", "eligible")
    .eq("moderation_status", "approved")
    .eq("recommendation_eligible", true)
    .is("archived_at", null)
    .maybeSingle();
  if (root.error) throw Error("Program could not be loaded.");
  if (!root.data?.published_version_id) return null;
  const version = await client
    .from("program_versions")
    .select("definition,version")
    .eq("id", root.data.published_version_id)
    .maybeSingle();
  if (version.error) throw Error("Program version could not be loaded.");
  if (!version.data) return null;
  const definition = version.data.definition as ProgramDefinition;
  if (definition.schema_version !== 1 || !Array.isArray(definition.days))
    throw Error("Unsupported program version.");
  const ids = [
    ...new Set(
      definition.days.flatMap((d) =>
        d.slots.flatMap((s) => [
          s.exercise_id,
          ...s.alternatives.map((a) => a.exercise_id),
        ]),
      ),
    ),
  ];
  const [exercises, equipment, patterns] = await Promise.all([
    client.from("exercises").select("id,name").in("id", ids),
    client
      .from("equipment_types")
      .select("id,name")
      .in("id", definition.equipment),
    client
      .from("movement_patterns")
      .select("id,name")
      .in("id", [
        ...new Set(
          definition.days.flatMap((d) =>
            d.slots.map((s) => s.movement_pattern_id),
          ),
        ),
      ]),
  ]);
  if (exercises.error || equipment.error || patterns.error)
    throw Error("Program exercise references could not be loaded.");
  return {
    definition,
    versionId: root.data.published_version_id as string,
    version: version.data.version as number,
    publishedAt: root.data.first_published_at as string,
    featured: root.data.featured as boolean,
    exercises: new Map(
      (exercises.data ?? []).map((e) => [e.id, e.name as string]),
    ),
    equipment: equipment.data ?? [],
    patterns: new Map(
      (patterns.data ?? []).map((e) => [e.id, e.name as string]),
    ),
  };
}
