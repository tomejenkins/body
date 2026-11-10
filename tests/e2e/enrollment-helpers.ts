import { execFileSync } from "node:child_process";
import { expect } from "@playwright/test";
import { localAuth } from "./auth-helpers";
import type { Account } from "./selection-helpers";
export function seedLegacyEnrollment(a: Account, version: string) {
  localAuth();
  for (const id of [a.userId, version])
    if (!/^[0-9a-f-]{36}$/.test(id))
      throw Error("Invalid local fixture identity");
  execFileSync(
    "docker",
    [
      "--host=unix:///var/run/docker.sock",
      "exec",
      "-i",
      "supabase_db_body",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: `insert into public.program_assignments(owner_id,program_id,cycle_length,source_version_id) select '${a.userId}',program_id,(definition->'program'->>'cycle_length')::int,id from public.program_versions where id='${version}';`,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}
export async function enrollFixture(a: Account, version: string) {
  const row = await a.client
    .from("program_assignments")
    .select("id,lifecycle_revision,source_version_id")
    .eq("owner_id", a.userId)
    .eq("state", "active")
    .maybeSingle();
  expect(row.error).toBeNull();
  const r = await a.client.rpc("program_lifecycle", {
    p_kind: row.data ? "switch" : "start",
    p_request: crypto.randomUUID(),
    p_assignment: row.data?.id ?? null,
    p_expected: row.data?.lifecycle_revision ?? 0,
    p_version: version,
    p_start: new Date().toISOString().slice(0, 10),
    p_timezone: "UTC",
  });
  expect(r.error).toBeNull();
  return r.data.assignmentId as string;
}
export async function enrollFromDetail(
  page: import("@playwright/test").Page,
  detailUrl: string,
) {
  const start = page.getByRole("link", { name: "Start Program", exact: true });
  if (await start.count()) {
    await start.click();
    await page.getByLabel("Scheduling timezone", { exact: true }).fill("UTC");
    await page.getByLabel("Use this timezone for scheduling").check();
    await page
      .getByRole("button", { name: "Start Program", exact: true })
      .click();
    await expect(page).toHaveURL(/programs\/current$/);
    await page.goto(detailUrl);
  }
}
