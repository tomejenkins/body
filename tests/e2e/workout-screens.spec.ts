import { enrollFromDetail } from "./enrollment-helpers";
import {
  openWorkoutManagement,
  openWorkoutEnding,
  openExerciseLogger,
  backToWorkoutHome,
} from "./workout-screen-helpers";
import { expect, test, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import programs from "../../supabase/catalog/programs.json" with { type: "json" };
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(120000);
async function login(
  page: Page,
  a: Awaited<ReturnType<typeof verifiedAccount>>,
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
}
const home = (page: Page) =>
  page.getByRole("region", { name: "Workout Home", exact: true });
const logger = (page: Page) =>
  page.getByRole("region", { name: "Exercise Logger", exact: true });
const cards = (page: Page) => home(page).locator(".workout-movement-card");
const carousel = (page: Page) => page.locator(".movement-carousel");
test("program Home accordion, focused navigation, status, context, refresh and reduced motion", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await login(page, a);
  const p = programs.find((p) => p.slug === "upper-lower-strength-size")!;
  await page.goto(`/programs/${p.id}`);
  await enrollFromDetail(page, `/programs/${p.id}`);
  await page
    .getByRole("button", { name: "Start Workout 1", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  const path = new URL(page.url()).pathname;
  await expect(home(page)).toBeVisible();
  await expect(cards(page)).toHaveCount(5);
  await expect(carousel(page)).toHaveCount(0);
  await expect(page.locator(".logged-set")).toHaveCount(0);
  await expect(cards(page).first()).toContainText("Not Started");
  await expect(
    page.getByRole("button", { name: /Workout Timer/ }),
  ).toBeVisible();
  await cards(page)
    .nth(0)
    .getByRole("button", { name: /^Choose exercise/, exact: true })
    .click();
  await expect(carousel(page)).toHaveCount(1);
  await cards(page)
    .nth(1)
    .getByRole("button", { name: /^Choose exercise/, exact: true })
    .click();
  await expect(carousel(page)).toHaveCount(1);
  await expect(
    cards(page)
      .nth(0)
      .getByRole("button", { name: /^Choose exercise/, exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await cards(page)
    .nth(1)
    .getByRole("button", { name: /^Hide exercises/, exact: true })
    .click();
  await expect(carousel(page)).toHaveCount(0);
  await cards(page)
    .nth(0)
    .getByRole("button", { name: /^Choose exercise/, exact: true })
    .click();
  await carousel(page).getByRole("button").first().click();
  await expect(page).toHaveURL(/\?exercise=[a-f0-9-]{36}$/);
  await expect(logger(page)).toBeVisible();
  await expect(home(page)).toHaveCount(0);
  await expect(page.locator(".logged-set")).toHaveCount(3);
  await expect(carousel(page)).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Finish workout", exact: true }),
  ).toHaveCount(0);
  const focusedUrl = page.url();
  await page.reload();
  await expect(logger(page)).toBeVisible();
  await expect(page.locator(".exercise-progress-summary")).toContainText(
    "Not Started",
  );
  const row = page.locator(".logged-set").first();
  await row.getByRole("textbox", { name: /weight/ }).fill("100");
  await row.getByRole("textbox", { name: /reps/ }).fill("6");
  await row.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(row.locator(".set-save-state")).toHaveText(/^Saved/);
  await backToWorkoutHome(page);
  await expect(page).toHaveURL(new RegExp(path + "$"));
  await expect(cards(page).first()).toContainText("In Progress");
  await page.reload();
  await expect(cards(page).first()).toContainText("In Progress");
  await page
    .getByRole("link", { name: "Open exercise logger", exact: true })
    .click();
  await expect(page).toHaveURL(focusedUrl);
  await page.getByRole("link", { name: "Look Back", exact: true }).click();
  await page
    .getByRole("link", { name: "Back to Exercise Logger", exact: true })
    .click();
  await expect(page).toHaveURL(focusedUrl);
  await page.locator(".selected-exercise-title a").first().click();
  await page
    .getByRole("link", { name: "← Back to Exercise Logger", exact: true })
    .click();
  await expect(page).toHaveURL(focusedUrl);
  // Saved performance fulfills the prescription; no draft or navigation inference.
  const itemId = new URL(focusedUrl).searchParams.get("exercise")!;
  const sets = await a.client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", itemId)
    .eq("status", "pending");
  for (const s of sets.data!)
    expect(
      (
        await a.client.rpc("log_workout_set", {
          p_item: itemId,
          p_id: s.id,
          p_revision: s.revision,
          p_operation: "save",
          p_mutation: crypto.randomUUID(),
          p_reps: 6,
          p_weight: 45,
          p_completed: true,
        })
      ).error,
    ).toBeNull();
  await page.reload();
  await backToWorkoutHome(page);
  await expect(cards(page).first()).toContainText("Complete");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expect(home(page)).toHaveCSS("animation-name", "none");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await home(page).screenshot({
      path: info.outputPath(`workout-home-${colorScheme}.png`),
      animations: "disabled",
    });
  }
  await page.goto("/dashboard");
  await page
    .getByRole("complementary", { name: "Active workout", exact: true })
    .getByRole("link", { name: "Resume", exact: true })
    .click();
  await expect(home(page)).toBeVisible();
  await expect(logger(page)).toHaveCount(0);
});
test("ad-hoc Home, incomplete Back and pending/failed draft persistence without forced completion", async ({
  page,
}) => {
  const a = await verifiedAccount();
  const w = await a.client.rpc("start_ad_hoc_workout");
  const ex = catalog.exercises.find((e) => e.slug === "push_up")!;
  await a.client.rpc("edit_workout", {
    p_session: w.data,
    p_operation: "add",
    p_exercise: ex.id,
  });
  await a.client.rpc("edit_workout", {
    p_session: w.data,
    p_operation: "add",
    p_exercise: catalog.exercises.find((e) => e.slug === "barbell_bench_press")!
      .id,
  });
  await login(page, a);
  await page.goto(`/workout/${w.data}`);
  await expect(
    cards(page).filter({
      has: page.getByRole("heading", { name: "Push-up", exact: true }),
    }),
  ).toContainText("Not Started");
  await openExerciseLogger(page, "Push-up");
  await expect(
    page
      .getByRole("navigation", { name: "Workout exercises", exact: true })
      .getByRole("link", { name: "Push-up Selected", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const strip = page.getByRole("navigation", {
    name: "Workout exercises",
    exact: true,
  });
  await expect(strip.getByRole("link")).toHaveCount(2);
  await strip
    .getByRole("link", { name: "Barbell bench press Open logger", exact: true })
    .click();
  await backToWorkoutHome(page);
  await openWorkoutManagement(page);
  await expect(
    page.getByRole("button", {
      name: "Move Barbell bench press up",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Move Barbell bench press down",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Move Barbell bench press up", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Move Barbell bench press up",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(cards(page).locator("h2")).toHaveText([
    "Barbell bench press",
    "Push-up",
  ]);
  await openExerciseLogger(page, "Push-up");
  await page.route("**/workout/**", (r) =>
    r.request().method() === "POST" ? r.abort() : r.continue(),
  );
  await page
    .locator(".logged-set")
    .first()
    .getByRole("textbox", { name: /reps/ })
    .fill("12");
  await backToWorkoutHome(page);
  await expect(
    cards(page).filter({
      has: page.getByRole("heading", { name: "Push-up", exact: true }),
    }),
  ).toContainText("Not Started");
  await openWorkoutEnding(page);
  await expect(
    page.getByRole("button", { name: "Finish workout", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Keep training" }).click();
  await openExerciseLogger(page, "Push-up");
  const row = page.locator(".logged-set").first();
  await expect(row.getByRole("textbox", { name: /reps/ })).toHaveValue("12");
  await expect(row.locator(".set-save-state")).toContainText("Not saved");
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await expect(row.getByRole("textbox", { name: /reps/ })).toHaveValue("12");
  await page.unroute("**/workout/**");
  await row.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(row.locator(".set-save-state")).toHaveText(/^Saved/);
  await row.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(row.locator(".set-save-state")).toHaveText(/^Saved/);
  await backToWorkoutHome(page);
  await expect(
    cards(page).filter({
      has: page.getByRole("heading", { name: "Push-up", exact: true }),
    }),
  ).toContainText("In Progress");
  await openWorkoutEnding(page);
  await page
    .getByRole("checkbox", { name: /Finish without completing all sets/ })
    .check();
  await openWorkoutEnding(page);
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/complete$/);
});
test("stale Home selection cannot overwrite another tab and foreign focus reveals no performance", async ({
  page,
  browser,
}) => {
  const a = await verifiedAccount();
  await login(page, a);
  const p = programs.find((p) => p.slug === "upper-lower-strength-size")!;
  await page.goto(`/programs/${p.id}`);
  await enrollFromDetail(page, `/programs/${p.id}`);
  await page
    .getByRole("button", { name: "Start Workout 1", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  const path = new URL(page.url()).pathname;
  const other = await browser.newContext();
  await other.addCookies(await page.context().cookies());
  const tab = await other.newPage();
  await tab.goto(path);
  await cards(page)
    .first()
    .getByRole("button", { name: /^Choose exercise/, exact: true })
    .click();
  await cards(tab)
    .first()
    .getByRole("button", { name: /^Choose exercise/, exact: true })
    .click();
  await carousel(page).getByRole("button").first().click();
  await expect(logger(page)).toBeVisible();
  await carousel(tab).getByRole("button").nth(1).click();
  await expect(tab.getByText(/movement changed elsewhere/i)).toBeVisible();
  await expect(home(tab)).toBeVisible();
  const w = path.split("/").pop()!;
  const saved = await a.client
    .from("workout_exercises")
    .select("id,exercise_id")
    .eq("workout_session_id", w)
    .is("removed_at", null);
  expect(saved.data).toHaveLength(1);
  const stranger = await verifiedAccount();
  const foreignWorkout = await stranger.client.rpc("start_ad_hoc_workout");
  const foreignItem = await stranger.client.rpc("edit_workout", {
    p_session: foreignWorkout.data,
    p_operation: "add",
    p_exercise: catalog.exercises.find((e) => e.slug === "push_up")!.id,
  });
  expect(foreignItem.error).toBeNull();
  await tab.goto(`${path}?exercise=${foreignItem.data}`);
  await expect(home(tab)).toBeVisible();
  await expect(tab.locator(".logged-set")).toHaveCount(0);
  await tab.reload();
  await expect(home(tab)).toBeVisible();
  await other.close();
});
