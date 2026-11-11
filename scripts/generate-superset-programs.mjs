import fs from "node:fs";
import { execFileSync } from "node:child_process";
// Validate all fourteen recipes and verify the frozen first catalog migration.
execFileSync(
  process.execPath,
  [
    new URL("./generate-program-catalog.mjs", import.meta.url).pathname,
    "--check",
  ],
  { stdio: "inherit" },
);
const recipes = JSON.parse(
  fs.readFileSync(
    new URL("../supabase/catalog/superset-programs.json", import.meta.url),
    "utf8",
  ),
);
const loader = fs.readFileSync(
  new URL(
    "../supabase/catalog/superset-program-seed-loader.sql",
    import.meta.url,
  ),
  "utf8",
);
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const sql = `-- Original Superset programs; forward-only, never rewrite published versions.\nbegin;\n${loader}\ncreate or replace function body_private.install_body_superset_catalog() returns void language plpgsql security invoker set search_path='' as $catalog$ declare recipe jsonb;begin for recipe in select value from jsonb_array_elements(${quote(JSON.stringify(recipes))}::jsonb) loop perform body_private.install_body_superset_program(recipe);end loop;end $catalog$;\nrevoke all on function body_private.install_body_superset_catalog() from public,anon,authenticated,service_role;\nselect body_private.install_body_superset_catalog();\ncommit;\n`;
const path = new URL(
  "../supabase/migrations/20261111204706_superset_program_catalog.sql",
  import.meta.url,
);
if (process.argv.includes("--check")) {
  if (fs.readFileSync(path, "utf8") !== sql)
    throw Error(
      "Superset catalog migration differs; published migrations must stay immutable.",
    );
} else fs.writeFileSync(path, sql);
console.log("Superset catalog: two immutable programs, real prescribed groups");
