// Build-time review tool. Does not connect to any database.
import fs from "node:fs";
const read = (path) =>
  JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const programs = read("../supabase/catalog/programs.json"),
  catalog = read("../supabase/catalog/exercises.json");
if (
  programs.length !== 12 ||
  new Set(programs.map((p) => p.id)).size !== 12 ||
  new Set(programs.map((p) => p.slug)).size !== 12
)
  throw Error("Expected twelve unique original programs");
const names = [
  "Full Body Foundation",
  "Foundational Barbell Strength",
  "Upper / Lower Strength & Size",
  "Push / Pull / Legs",
  "Classic Body-Part Split",
  "Classic Physique — Six Day",
  "High Intensity, Low Volume",
  "Powerbuilding",
  "Strength 5×5",
  "Three-Day Hypertrophy",
  "Dumbbell-Only Full Body",
  "Functional Strength",
];
if (programs.some((p, i) => p.name !== names[i]))
  throw Error("Only reviewed original Body program titles are allowed");
const exercises = new Map(catalog.exercises.map((e) => [e.id, e]));
for (const p of programs) {
  if (
    !p.summary ||
    !p.description.includes("## Progression") ||
    p.days.length < 3 ||
    p.days.length > 366
  )
    throw Error(`Incomplete ${p.slug}`);
  let working = 0;
  for (const d of p.days) {
    if (
      d.rest ? d.slots.length !== 0 : d.slots.length < 3 || d.slots.length > 6
    )
      throw Error(`Invalid day ${p.slug}/${d.name}`);
    for (const s of d.slots) {
      const e = exercises.get(s.exerciseId);
      if (
        !e ||
        e.slug !== s.exercise ||
        e.exerciseType !== s.exerciseType ||
        catalog.movementPatterns.find((t) => t.id === s.movementPatternId)
          ?.slug !== e.primaryPattern ||
        !e.primaryMuscles.includes(
          catalog.muscleGroups.find((t) => t.id === s.primaryMuscleId)?.slug,
        )
      )
        throw Error(`Invalid canonical slot ${p.slug}/${s.exercise}`);
      if (
        s.sets < 1 ||
        s.sets > 5 ||
        s.repsMin < 1 ||
        s.repsMax < s.repsMin ||
        s.repsMax > 15 ||
        !Number.isInteger(s.sets) ||
        s.effortScale !== "rir" ||
        s.effortValue < 0 ||
        s.effortValue > 5
      )
        throw Error("Invalid prescription");
      if (p.experience === "beginner" && (s.failure || s.sets > 3))
        throw Error("Beginner density/failure");
      if (s.failure && e.exerciseType !== "isolation")
        throw Error("Failure intent limited to selected isolation sets");
      for (const candidate of [
        e,
        ...s.alternatives.map((id) => exercises.get(id)),
      ]) {
        if (
          !candidate ||
          candidate.exerciseType !== e.exerciseType ||
          candidate.primaryPattern !== e.primaryPattern ||
          !candidate.primaryMuscles.includes(e.primaryMuscles[0])
        )
          throw Error(`Incompatible substitution ${s.exercise}`);
        for (const q of candidate.equipment) {
          const id = catalog.equipmentTypes.find((t) => t.slug === q)?.id;
          if (!s.equipmentIds.includes(id)) throw Error("Equipment omission");
          if (
            p.slug === "dumbbell-only-full-body" &&
            !["dumbbell", "none"].includes(q)
          )
            throw Error("Dumbbell-only equipment breach");
        }
      }
      working += s.sets;
    }
  }
  if (!working) throw Error("Empty template");
}
const path = new URL(
  "../supabase/migrations/20261105194446_body_program_catalog.sql",
  import.meta.url,
);
const loader = fs.readFileSync(
  new URL("../supabase/catalog/program-seed-loader.sql", import.meta.url),
  "utf8",
);
const q = (s) => "'" + s.replaceAll("'", "''") + "'";
const sql = `-- Generated from programs.json by generate-program-catalog.mjs. Review both.\nbegin;\n${loader}\ncreate function body_private.install_body_catalog() returns void language plpgsql security invoker set search_path='' as $body_catalog$\ndeclare recipe jsonb;begin\n for recipe in select value from jsonb_array_elements(${q(JSON.stringify(programs))}::jsonb) loop perform body_private.install_body_program(recipe);end loop;\nend $body_catalog$;\nrevoke all on function body_private.install_body_catalog() from public,anon,authenticated,service_role;\nselect body_private.install_body_catalog();\ncommit;\n`;
if (process.argv.includes("--check")) {
  if (fs.readFileSync(path, "utf8") !== sql)
    throw Error(
      "Program seed migration differs from source/generator. Never regenerate after deployment; use a new migration.",
    );
} else fs.writeFileSync(path, sql);
console.log(
  `Programs: ${programs.length}; training days: ${programs.reduce((n, p) => n + p.days.filter((d) => !d.rest).length, 0)}; slots: ${programs.reduce((n, p) => n + p.days.reduce((x, d) => x + d.slots.length, 0), 0)}`,
);
