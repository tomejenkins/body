// Build-time review tool only. Never imported by the app or executed against a database.
import fs from "node:fs";
const data = JSON.parse(
  fs.readFileSync(
    new URL("../supabase/catalog/exercises.json", import.meta.url),
    "utf8",
  ),
);
for (const key of [
  "movementPatterns",
  "muscleGroups",
  "equipmentTypes",
  "exercises",
]) {
  const seen = new Set();
  for (const row of data[key]) {
    if (!/^[a-z][a-z0-9_]*$/.test(row.slug) || seen.has(row.slug))
      throw new Error(`Invalid or duplicate ${key} slug: ${row.slug}`);
    seen.add(row.slug);
  }
}
for (const row of data.exercises) {
  if (!["compound", "isolation", "other"].includes(row.exerciseType))
    throw new Error(`Missing exercise type: ${row.slug}`);
  if (!data.movementPatterns.some((p) => p.slug === row.primaryPattern))
    throw new Error(`Missing primary pattern: ${row.slug}`);
  for (const [field, taxonomy] of [
    ["primaryMuscles", "muscleGroups"],
    ["secondaryMuscles", "muscleGroups"],
    ["equipment", "equipmentTypes"],
    ["secondaryPatterns", "movementPatterns"],
  ]) {
    if (row[field].some((slug) => !data[taxonomy].some((t) => t.slug === slug)))
      throw new Error(`Unknown ${field}: ${row.slug}`);
  }
}
const q = (value) => "'" + value.replaceAll("'", "''") + "'";
let sql =
  "-- Generated from supabase/catalog/exercises.json; review and commit both.\n-- New forward-only catalog data. No user data, updates, deletes or client write grants.\nbegin;\n";
for (const [key, table] of [
  ["movementPatterns", "movement_patterns"],
  ["muscleGroups", "muscle_groups"],
  ["equipmentTypes", "equipment_types"],
]) {
  sql +=
    `insert into public.${table}(id,slug,name,description) values\n` +
    data[key]
      .map(
        (r) =>
          `(${q(r.id)},${q(r.slug)},${q(r.name)},${r.description ? q(r.description) : "null"})`,
      )
      .join(",\n") +
    ";\n";
}
sql +=
  "create temporary table body_catalog(payload jsonb) on commit drop;\ninsert into body_catalog values\n" +
  data.exercises.map((r) => `(${q(JSON.stringify(r))}::jsonb)`).join(",\n") +
  ";\n";
sql += `insert into public.exercises(id,slug,name,exercise_type,instructions)
select (payload->>'id')::uuid,payload->>'slug',payload->>'name',payload->>'exerciseType',payload->>'instructions' from body_catalog;
insert into public.exercise_movement_patterns(exercise_id,movement_pattern_id,is_primary)
select (c.payload->>'id')::uuid,p.id,true from body_catalog c join public.movement_patterns p on p.slug=c.payload->>'primaryPattern';
insert into public.exercise_movement_patterns(exercise_id,movement_pattern_id)
select (c.payload->>'id')::uuid,p.id from body_catalog c cross join lateral jsonb_array_elements_text(c.payload->'secondaryPatterns') s(slug) join public.movement_patterns p on p.slug=s.slug;
insert into public.exercise_muscles(exercise_id,muscle_group_id,muscle_role)
select (c.payload->>'id')::uuid,m.id,'primary' from body_catalog c cross join lateral jsonb_array_elements_text(c.payload->'primaryMuscles') s(slug) join public.muscle_groups m on m.slug=s.slug;
insert into public.exercise_muscles(exercise_id,muscle_group_id,muscle_role)
select (c.payload->>'id')::uuid,m.id,'secondary' from body_catalog c cross join lateral jsonb_array_elements_text(c.payload->'secondaryMuscles') s(slug) join public.muscle_groups m on m.slug=s.slug;
insert into public.exercise_equipment(exercise_id,equipment_type_id)
select (c.payload->>'id')::uuid,e.id from body_catalog c cross join lateral jsonb_array_elements_text(c.payload->'equipment') s(slug) join public.equipment_types e on e.slug=s.slug;
commit;
`;
const target = new URL(
  "../supabase/migrations/20261103202740_curated_exercise_catalog.sql",
  import.meta.url,
);
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8") !== sql)
    throw new Error(
      "Catalog SQL differs from reviewed data; regenerate before applying this NEW migration.",
    );
} else fs.writeFileSync(target, sql);
console.log(`Catalog: ${data.exercises.length} exercises`);
