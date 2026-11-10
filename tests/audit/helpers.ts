import { expect, type Page } from "@playwright/test";
import { verifiedAccount } from "../e2e/auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
export async function fixture(page: Page) {
  const a = await verifiedAccount();
  const ex = catalog.exercises.find((e) => e.slug === "barbell_bench_press");
  if (!ex) throw Error("Benchmark exercise missing");
  const started = await a.client.rpc("start_exercise_workout", {
    p_exercises: [ex.id],
    p_request: crypto.randomUUID(),
  });
  expect(started.error).toBeNull();
  const selected = await a.client
    .from("workout_exercises")
    .select("id")
    .eq("workout_session_id", started.data)
    .single();
  expect(selected.error).toBeNull();
  const item = selected.data!.id;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await page.goto(`/workout/${started.data}?exercise=${item}`);
  const row = page.locator(".logged-set").first();
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  await row.getByRole("textbox", { name: /weight/ }).fill("100");
  await row.getByRole("textbox", { name: /reps/ }).fill("8");
  await row.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  return { a, row, session: started.data as string, item };
}
