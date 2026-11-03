import { expect, test, type Page } from "@playwright/test";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
import { verifiedAccount } from "./auth-helpers";
test.setTimeout(90000);
async function signIn(
  page: Page,
  account: Awaited<ReturnType<typeof verifiedAccount>>,
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("hydrated"))
      errors.push(message.text());
  });
});
test.afterEach(() => expect(errors).toEqual([]));
test("start, resume, select visuals, reorder, remove and finish without fabricated sets", async ({
  page,
}) => {
  const account = await verifiedAccount();
  await signIn(page, account);
  await page.goto("/workout");
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Workout", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const path = new URL(page.url()).pathname;
  const sessionId = path.split("/").at(-1);
  if (!sessionId) throw new Error("Missing workout ID");
  await expect(
    page.getByRole("heading", { name: "No exercises selected yet." }),
  ).toBeVisible();
  await page.goto("/workout");
  await page.getByRole("link", { name: "Resume workout", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + "$"));
  await page.getByRole("link", { name: "Add exercises", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your movements." }),
  ).toBeVisible();
  for (const name of ["Barbell bench press", "Dumbbell lateral raise"]) {
    await page.getByRole("searchbox").fill(name);
    const card = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    const image = card.locator("img");
    await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty("complete", true);
    expect(
      await image.evaluate(
        (e: HTMLImageElement) => e.complete && e.naturalWidth > 0,
      ),
    ).toBe(true);
    await card
      .getByRole("button", { name: "Select exercise", exact: true })
      .click();
    await expect(
      card.getByRole("button", { name: "Already selected", exact: true }),
    ).toBeDisabled();
  }
  await page.getByRole("link", { name: /^Done · 2 selected$/ }).click();
  await expect(page.locator(".workout-items li")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".workout-items li h2")).toHaveText([
    "Barbell bench press",
    "Dumbbell lateral raise",
  ]);
  await page
    .getByRole("button", {
      name: "Move Dumbbell lateral raise up",
      exact: true,
    })
    .click();
  await expect(page.locator(".workout-items li h2")).toHaveText([
    "Dumbbell lateral raise",
    "Barbell bench press",
  ]);
  await page
    .getByRole("button", { name: "Remove Barbell bench press", exact: true })
    .click();
  await expect(page.locator(".workout-items li")).toHaveCount(1);
  await expect(page.locator(".workout-items li img")).toBeVisible();
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\?message=completed$/);
  await expect(page.locator(".auth-success")).toContainText("Workout finished");
  const result = await account.client
    .from("workout_sessions")
    .select("status,completion_status,started_at,finished_at")
    .eq("id", sessionId)
    .single();
  expect(result.error).toBeNull();
  expect(result.data?.status).toBe("completed");
  expect(result.data?.completion_status).toBe("none");
  const rows = await account.client
    .from("workout_exercises")
    .select("id,removed_at,exercise_name_snapshot")
    .eq("workout_session_id", sessionId);
  expect(rows.data).toHaveLength(2);
  expect(rows.data?.filter((r) => r.removed_at)).toHaveLength(1);
  const sets = await account.client.from("workout_sets").select("id");
  expect(sets.data).toEqual([]);
  await page.goto(path);
  await expect(page.getByText("Finished", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add exercises", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No completed sets were recorded.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("concurrent starts share one session, owner boundaries hold and abandon preserves it", async ({
  page,
}) => {
  const account = await verifiedAccount();
  const results = await Promise.all(
    Array.from({ length: 3 }, () => account.client.rpc("start_ad_hoc_workout")),
  );
  for (const result of results) expect(result.error).toBeNull();
  const sessionId = results[0].data;
  if (typeof sessionId !== "string") throw new Error("Missing active ID");
  expect(new Set(results.map((r) => r.data)).size).toBe(1);
  const system = catalog.exercises.find((e) => e.slug === "push_up");
  if (!system) throw new Error("Missing catalog entry");
  expect(
    (
      await account.client.rpc("edit_workout", {
        p_session: sessionId,
        p_operation: "add",
        p_exercise: system.id,
      })
    ).error,
  ).toBeNull();
  const other = await verifiedAccount();
  expect(
    (
      await other.client.rpc("edit_workout", {
        p_session: sessionId,
        p_operation: "add",
        p_exercise: system.id,
      })
    ).error?.code,
  ).toBe("42501");
  expect(
    (
      await other.client
        .from("workout_sessions")
        .select("id")
        .eq("id", sessionId)
    ).data,
  ).toEqual([]);
  await signIn(page, account);
  await page.goto("/workout");
  await page.getByRole("link", { name: "Resume workout", exact: true }).click();
  await expect(page.locator(".workout-items li h2")).toHaveText(["Push-up"]);
  await page.getByText("Abandon instead", { exact: true }).click();
  await page
    .getByRole("button", { name: "Abandon workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\?message=abandoned$/);
  const session = await account.client
    .from("workout_sessions")
    .select("status,finished_at")
    .eq("id", sessionId)
    .single();
  expect(session.data?.status).toBe("abandoned");
  expect(session.data?.finished_at).toBeTruthy();
  expect(
    (
      await account.client.rpc("end_workout", {
        p_session: sessionId,
        p_outcome: "completed",
      })
    ).error?.code,
  ).toBe("23514");
  const records = await account.client
    .from("workout_exercises")
    .select("id")
    .eq("workout_session_id", sessionId);
  expect(records.data).toHaveLength(1);
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  expect(new URL(page.url()).pathname).not.toBe(`/workout/${sessionId}`);
});
