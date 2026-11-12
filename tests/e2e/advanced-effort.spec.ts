import { openAdvancedEffort } from "./set-options-helpers";
import {
  openWorkoutEnding,
  openExerciseLogger,
  backToWorkoutHome,
} from "./workout-screen-helpers";
import { expect, test, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(180000);
async function setup(page: Page) {
  const a = await verifiedAccount();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const w = await a.client.rpc("start_ad_hoc_workout");
  const exercise = catalog.exercises.find(
    (e) => e.slug === "barbell_bench_press",
  );
  if (!exercise) throw Error("Missing fixture");
  const item = await a.client.rpc("edit_workout", {
    p_session: w.data,
    p_operation: "add",
    p_exercise: exercise.id,
  });
  expect(item.error).toBeNull();
  return {
    ...a,
    w: w.data as string,
    item: item.data as string,
    exercise: exercise.id,
  };
}
async function saved(page: Page, index = 0) {
  await expect(
    page.locator(".logged-set").nth(index).locator(".set-save-state"),
  ).toHaveText(/^Saved/);
}
test("optional effort and failure persist independently through queue, refresh, new rows and history", async ({
  page,
}, testInfo) => {
  const a = await setup(page);
  await page.goto(`/workout/${a.w}`);
  await openExerciseLogger(page);
  const row = page.locator(".logged-set").first();
  await expect(
    row.getByRole("combobox", { name: /effort rating/ }),
  ).toHaveCount(0);
  await row.getByRole("textbox", { name: /weight/ }).fill("50");
  await row.getByRole("textbox", { name: /reps/ }).fill("5");
  await row.getByRole("checkbox", { name: / complete$/ }).click();
  await saved(page);
  await openAdvancedEffort(row);
  await row.getByRole("combobox", { name: /effort rating/ }).selectOption("10");
  await saved(page);
  await expect(
    row.getByRole("checkbox", { name: /To Failure/ }),
  ).not.toBeChecked();
  await row.getByRole("checkbox", { name: /To Failure/ }).check();
  await saved(page);
  await row.getByRole("combobox", { name: /type/ }).selectOption("drop");
  await saved(page);
  await page.reload();
  await openAdvancedEffort(row);
  await expect(row.getByRole("combobox", { name: /type/ })).toHaveValue("drop");
  await expect(row.getByRole("checkbox", { name: /To Failure/ })).toBeChecked();
  await expect(
    row.getByRole("combobox", { name: /effort rating/ }),
  ).toHaveValue("10");
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue("50");
  await row.getByRole("combobox", { name: /effort scale/ }).selectOption("rir");
  await saved(page);
  await expect(row.getByRole("combobox", { name: /effort scale/ })).toHaveValue(
    "rir",
  );
  await expect(
    row.getByRole("combobox", { name: /effort rating/ }),
  ).toHaveValue("");
  await expect(row.getByRole("checkbox", { name: /To Failure/ })).toBeChecked();
  await row.getByRole("combobox", { name: /effort rating/ }).selectOption("0");
  await saved(page);
  await row.getByRole("checkbox", { name: /To Failure/ }).uncheck();
  await saved(page);
  await expect(
    row.getByRole("checkbox", { name: /To Failure/ }),
  ).not.toBeChecked();
  await row.getByRole("checkbox", { name: /To Failure/ }).check();
  await saved(page);
  await row.getByRole("combobox", { name: /type/ }).selectOption("rest_pause");
  await saved(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await row.screenshot({
      path: testInfo.outputPath(`effort-${colorScheme}.png`),
      animations: "disabled",
      caret: "initial",
    });
  }
  await page
    .getByRole("button", {
      name: "Add set to Barbell bench press",
      exact: true,
    })
    .click();
  await saved(page, 3);
  const extra = page.locator(".logged-set").nth(3);
  await openAdvancedEffort(extra);
  await expect(
    extra.getByRole("combobox", { name: /effort rating/ }),
  ).toHaveValue("");
  await expect(
    extra.getByRole("checkbox", { name: /To Failure/ }),
  ).not.toBeChecked();
  await backToWorkoutHome(page);
  await openWorkoutEnding(page);
  await page
    .getByRole("checkbox", { name: /Finish without completing all sets/ })
    .check();
  await openWorkoutEnding(page);
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/complete$/);
  await page.goto(`/history/${a.w}`);
  await expect(page.locator(".history-detail")).toContainText(
    "Rest-pause · To Failure · RIR 0",
  );
  await expect(page.getByRole("combobox", { name: /effort/ })).toHaveCount(0);
  await page.goto(`/exercises/${a.exercise}/history`);
  await expect(page.locator("ol.performance-list")).toContainText(
    "Rest-pause · To Failure · RIR 0",
  );
  const w = await a.client.rpc("start_ad_hoc_workout");
  await a.client.rpc("edit_workout", {
    p_session: w.data,
    p_operation: "add",
    p_exercise: a.exercise,
  });
  await page.goto(`/workout/${w.data}`);
  await openExerciseLogger(page);
  const fresh = page.locator(".logged-set").first();
  await openAdvancedEffort(fresh);
  await expect(
    fresh.getByRole("combobox", { name: /effort rating/ }),
  ).toHaveValue("");
  await expect(
    fresh.getByRole("checkbox", { name: /To Failure/ }),
  ).not.toBeChecked();
});
test("remembered scale preference, retained failed effort draft, CAS conflict and warm-up exclusion", async ({
  page,
}) => {
  const a = await setup(page);
  await page.goto("/profile");
  const preferences = page.getByRole("region", {
    name: "Effort input preference",
  });
  await preferences
    .getByRole("combobox", { name: "Preferred effort scale" })
    .selectOption("rir");
  await expect(preferences.getByRole("status")).toContainText("Saved");
  await page.reload();
  await expect(preferences.getByRole("combobox")).toHaveValue("rir");
  await expect(
    page.getByRole("combobox", { name: "Weight Units" }),
  ).toHaveValue("lb");
  await page.goto(`/workout/${a.w}`);
  await openExerciseLogger(page);
  const row = page.locator(".logged-set").first();
  await openAdvancedEffort(row);
  await expect(row.getByRole("combobox", { name: /effort scale/ })).toHaveValue(
    "rir",
  );
  await row.getByRole("combobox", { name: /effort rating/ }).selectOption("5");
  await saved(page);
  await page.route("**/*", (route) =>
    route.request().method() === "POST" &&
    route.request().headers()["next-action"]
      ? route.abort()
      : route.continue(),
  );
  await row.getByRole("combobox", { name: /effort rating/ }).selectOption("2");
  await expect(row.locator(".set-save-state")).toContainText("Not saved");
  await page.unroute("**/*");
  page.once("dialog", (d) => d.accept());
  await page.reload();
  // Wait for client draft restoration before opening native details.
  await expect(page.locator("main")).toContainText("Recovered");
  await openAdvancedEffort(row);
  await expect(
    row.getByRole("combobox", { name: /effort rating/ }),
  ).toHaveValue("2");
  await row.getByRole("button", { name: "Retry save", exact: false }).click();
  await saved(page);
  await openAdvancedEffort(row);
  const rows = await a.client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", a.item)
    .order("position");
  const entry = rows.data?.[0];
  if (!entry) throw Error("Missing row");
  expect(
    (
      await a.client.rpc("log_workout_set", {
        p_item: a.item,
        p_id: entry.id,
        p_operation: "save",
        p_revision: entry.revision,
        p_mutation: crypto.randomUUID(),
        p_reps: 5,
        p_weight: 22.68,
        p_completed: false,
        p_effort: { scale: "rir", value: 3, failure: false },
      })
    ).error,
  ).toBeNull();
  await row.getByRole("combobox", { name: /effort rating/ }).selectOption("1");
  await expect(row.locator(".set-save-state")).toContainText("Not saved");
  await expect(row).toContainText("changed elsewhere");
  await row
    .getByRole("button", {
      name: "Discard this draft and use saved values",
      exact: true,
    })
    .click();
  await saved(page);
  await expect(
    row.getByRole("combobox", { name: /effort rating/ }),
  ).toHaveValue("3");
  await row.getByRole("combobox", { name: /type/ }).selectOption("warm_up");
  await saved(page);
  await expect(
    row.getByRole("checkbox", { name: /To Failure/ }),
  ).toBeDisabled();
});
