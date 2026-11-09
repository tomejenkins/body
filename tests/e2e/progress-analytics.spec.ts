import { openWorkoutEnding } from "./workout-screen-helpers";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { verifiedAccount } from "./auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.use({ timezoneId: "America/Los_Angeles" });
test.setTimeout(180000);
type Account = Awaited<ReturnType<typeof verifiedAccount>>;
const ex = (slug: string) => {
  const e = catalog.exercises.find((e) => e.slug === slug);
  if (!e) throw Error("Missing catalog fixture");
  return e.id;
};
async function login(page: Page, a: Account) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function start(a: Account, slug = "barbell_bench_press") {
  const w = await a.client.rpc("start_ad_hoc_workout");
  expect(w.error).toBeNull();
  const e = await a.client.rpc("edit_workout", {
    p_session: w.data,
    p_operation: "add",
    p_exercise: ex(slug),
  });
  expect(e.error).toBeNull();
  return { workout: w.data as string, item: e.data as string };
}
async function save(
  a: Account,
  item: string,
  index: number,
  reps: number,
  pounds: number | null,
) {
  const rows = await a.client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", item)
    .order("position");
  const row = rows.data?.[index];
  if (!row) throw Error("Missing test row");
  expect(
    (
      await a.client.rpc("log_workout_set", {
        p_item: item,
        p_id: row.id,
        p_operation: "save",
        p_revision: row.revision,
        p_mutation: randomUUID(),
        p_reps: reps,
        p_weight:
          pounds === null
            ? null
            : Math.round(pounds * 0.45359237 * 1000) / 1000,
        p_completed: true,
        p_mode: pounds === null ? "bodyweight" : "external",
        p_entered_weight: pounds,
        p_entered_unit: pounds === null ? null : "lb",
      })
    ).error,
  ).toBeNull();
}
async function close(a: Account, id: string) {
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: id,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
}
test("historical dominance preserves exact records but suppresses redundant recognition; genuine tradeoff celebrates", async ({
  page,
}) => {
  const a = await verifiedAccount();
  await login(page, a);
  const baseline = await start(a);
  await save(a, baseline.item, 0, 5, 225);
  await save(a, baseline.item, 1, 3, 185);
  await close(a, baseline.workout);
  const current = await start(a);
  await save(a, current.item, 0, 3, 225);
  await close(a, current.workout);
  await page.goto(`/workout?message=completed&finished=${current.workout}`);
  await expect(page).toHaveURL(
    new RegExp(`/workout/${current.workout}/complete$`),
  );
  await expect(
    page.getByRole("heading", { name: "Workout Complete!" }),
  ).toBeVisible();
  await expect(page.locator(".achievement-card")).toHaveCount(0);
  await page.goto("/history/records");
  const bench = page.locator(".record-card").filter({
    has: page.getByRole("heading", {
      name: "Barbell bench press",
      exact: true,
    }),
  });
  await expect(
    bench
      .locator("dl>div")
      .filter({ has: page.getByText("Best Triple", { exact: true }) }),
  ).toContainText("225 lb");
  await expect(bench).toContainText("Best Five-Rep Set");
  await expect(
    bench.getByRole("link", { name: "View record workout →" }).first(),
  ).toBeVisible();
  const improved = await start(a);
  await save(a, improved.item, 0, 3, 235);
  await page.goto(`/workout/${improved.workout}`);
  const ack = page.getByRole("checkbox", {
    name: /Finish without completing all sets/,
  });
  if (await ack.isVisible()) await ack.check();
  await openWorkoutEnding(page);
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/complete$/);
  await expect(page.locator(".achievement-card")).toHaveCount(1);
  await expect(page.locator(".achievement-card")).toContainText("235 lb");
  await page.reload();
  await expect(page.locator(".achievement-card")).toHaveCount(1);
  await page.goto(`/exercises/${ex("barbell_bench_press")}/history`);
  const progress = page.getByRole("region", {
    name: "Exercise progress",
    exact: true,
  });
  await expect(
    progress.getByRole("combobox", { name: "Chart metric" }),
  ).toBeVisible();
  await progress
    .getByRole("combobox", { name: "Chart metric" })
    .selectOption({ label: "Heaviest Lift" });
  await expect(progress.locator(".chart-detail")).toContainText("235 lb");
  await expect(progress.getByRole("img")).toHaveAccessibleName(/Heaviest Lift/);
  await progress
    .getByRole("combobox", { name: "Date range" })
    .selectOption("all");
  await expect(
    progress.getByRole("slider", { name: "Select recorded point" }),
  ).toBeVisible();
  await progress.getByRole("slider").fill("0");
  await expect(progress.locator(".chart-detail")).toContainText("225 lb");
  await progress
    .getByRole("combobox", { name: "Chart metric" })
    .selectOption({ label: "Estimated 1RM" });
  await expect(progress.locator(".chart-detail")).toBeVisible();
  await progress
    .getByRole("combobox", { name: "Comparable load" })
    .selectOption({ label: "225 lb" });
  await expect(
    progress.getByRole("combobox", { name: "Chart metric" }),
  ).toHaveValue(/reps_at_load/);
  await expect(progress.locator(".chart-detail")).toContainText(
    "reps at 225 lb",
  );
  await progress.getByText("View chart data", { exact: true }).click();
  await expect(progress.getByRole("table")).toBeVisible();
  await progress
    .locator(".chart-detail")
    .getByRole("link", { name: "View workout →" })
    .click();
  await expect(
    page.getByText("Saved workout · Read only", { exact: true }),
  ).toBeVisible();
});
test("activity calendar, unit preference, volume and accessible mobile progress layouts", async ({
  page,
}, testInfo) => {
  const a = await verifiedAccount();
  await login(page, a);
  await page.goto("/history");
  await page
    .getByRole("link", { name: "Training progress →", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Training progress", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No completed workouts in this period.", { exact: false }),
  ).toBeVisible();
  const first = await start(a);
  await save(a, first.item, 0, 5, 50);
  await close(a, first.workout);
  const second = await start(a, "pull_up");
  await save(a, second.item, 0, 10, null);
  await save(a, second.item, 1, 6, 25);
  await close(a, second.workout);
  await page.goto("/history/progress");
  const summary = page.getByRole("region", { name: "Training summary" });
  await expect(summary).toContainText("Completed workouts");
  await expect(
    summary
      .locator("div")
      .filter({ has: page.getByText("Training days", { exact: true }) }),
  ).toContainText("1");
  const calendar = page.getByRole("region", { name: "Training calendar" });
  await expect(
    calendar.getByRole("link", { name: /2 completed workouts/ }),
  ).toBeVisible();
  await calendar
    .getByRole("button", { name: "Previous calendar month" })
    .click();
  await expect(
    calendar.getByRole("button", { name: "Next calendar month" }),
  ).toBeEnabled();
  await calendar.getByRole("button", { name: "Next calendar month" }).click();
  await expect(
    calendar.getByRole("link", { name: /2 completed workouts/ }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Date range" }).selectOption("30");
  await expect(summary).toBeVisible();
  await page
    .getByRole("combobox", { name: "Volume exercise" })
    .selectOption(ex("barbell_bench_press"));
  await expect(
    page.getByRole("figure", { name: "Exercise external-load volume" }),
  ).toContainText("250 lb × reps");
  await expect(
    page.getByRole("region", { name: "Muscle exposure" }),
  ).toContainText("secondary involvement");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`overview-${colorScheme}.png`),
      fullPage: true,
      animations: "disabled",
      caret: "initial",
    });
  }
  await page.goto("/profile");
  await page.getByRole("combobox", { name: "Weight Units" }).selectOption("kg");
  await expect(page.getByRole("status")).toContainText(/saved/i);
  await page.goto(`/exercises/${ex("barbell_bench_press")}/history`);
  const progress = page.getByRole("region", {
    name: "Exercise progress",
    exact: true,
  });
  await progress
    .getByRole("combobox", { name: "Chart metric" })
    .selectOption({ label: "Heaviest Lift" });
  await expect(progress.locator(".chart-detail")).toContainText("22.68 kg");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`progress-${colorScheme}.png`),
      fullPage: true,
      animations: "disabled",
      caret: "initial",
    });
  }
  await page.goto(`/exercises/${ex("pull_up")}/history`);
  await expect(
    progress.getByRole("combobox", { name: "Chart metric" }),
  ).toHaveValue(/bodyweight_reps/);
  await expect(progress.locator(".chart-detail")).toContainText("10 reps");
  await progress
    .getByRole("combobox", { name: "Chart metric" })
    .selectOption({ label: "Heaviest Added Resistance · Added resistance" });
  await expect(progress.locator(".chart-detail")).toContainText("+11.34 kg");
});
