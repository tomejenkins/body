import {
  openWorkoutEnding,
  openExerciseLogger,
  backToWorkoutHome,
} from "./workout-screen-helpers";
import { test, expect, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(120000);
const row = (page: Page, n: number) => page.locator(".logged-set").nth(n);
async function saved(page: Page, n: number) {
  await expect(row(page, n).locator(".set-save-state")).toHaveText(/^Saved/);
}
test("automatic rows, exact pounds, meaningful history, concurrent retry and Settings-only units", async ({
  page,
}) => {
  const account = await verifiedAccount();
  const exercise = catalog.exercises.find(
    (e) => e.slug === "barbell_bench_press",
  );
  if (!exercise) throw Error("Missing fixture");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const first = await account.client.rpc("start_ad_hoc_workout");
  const selection = await account.client.rpc("edit_workout", {
    p_session: first.data,
    p_operation: "add",
    p_exercise: exercise.id,
  });
  expect(selection.error).toBeNull();
  await page.goto(`/workout/${first.data}`);
  await openExerciseLogger(page);
  await expect(page.locator(".logged-set")).toHaveCount(3);
  await expect(page.locator(".set-head")).toContainText("LBS");
  await expect(
    row(page, 0).getByRole("textbox", { name: /weight in pounds/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Weight unit", exact: true }),
  ).toHaveCount(0);
  for (const [i, weight] of ["50", "135", "52.5"].entries()) {
    await row(page, i)
      .getByRole("textbox", { name: /weight/ })
      .fill(weight);
    await row(page, i).getByRole("textbox", { name: /reps/ }).fill("8");
    await row(page, i)
      .getByRole("checkbox", { name: / complete$/ })
      .check();
    await saved(page, i);
    await page.reload();
    await expect(
      row(page, i).getByRole("textbox", { name: /weight/ }),
    ).toHaveValue(weight);
  }
  await row(page, 0).locator("summary").click();
  await row(page, 0)
    .getByRole("combobox", { name: /type/ })
    .selectOption("warm_up");
  await saved(page, 0);
  await page
    .getByRole("button", {
      name: "Add set to Barbell bench press",
      exact: true,
    })
    .click();
  await saved(page, 3);
  await expect(
    row(page, 3).getByRole("textbox", { name: /weight/ }),
  ).toHaveValue("52.5");
  await row(page, 3)
    .getByRole("textbox", { name: /weight/ })
    .fill("52.125");
  await row(page, 3)
    .getByRole("checkbox", { name: / complete$/ })
    .check();
  await saved(page, 3);
  await row(page, 3).locator("summary").click();
  await row(page, 3)
    .getByRole("combobox", { name: /type/ })
    .selectOption("rest_pause");
  await saved(page, 3);
  await backToWorkoutHome(page);
  await openWorkoutEnding(page);
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/message=completed/);
  // A newer completed-but-unperformed session and abandoned actual work must not displace the source.
  const empty = await account.client.rpc("start_ad_hoc_workout");
  await account.client.rpc("edit_workout", {
    p_session: empty.data,
    p_operation: "add",
    p_exercise: exercise.id,
  });
  expect(
    (
      await account.client.rpc("end_workout", {
        p_session: empty.data,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  const abandoned = await account.client.rpc("start_ad_hoc_workout");
  const abandonedItem = await account.client.rpc("edit_workout", {
    p_session: abandoned.data,
    p_operation: "add",
    p_exercise: exercise.id,
  });
  const abandonedRows = await account.client
    .from("workout_sets")
    .select("*")
    .eq("workout_exercise_id", abandonedItem.data)
    .order("position");
  const prior = abandonedRows.data?.[0];
  if (!prior) throw Error("Missing pending rows");
  expect(
    (
      await account.client.rpc("log_workout_set", {
        p_item: abandonedItem.data,
        p_id: prior.id,
        p_operation: "save",
        p_revision: prior.revision,
        p_mutation: crypto.randomUUID(),
        p_reps: 99,
        p_weight: 99,
        p_completed: true,
      })
    ).error,
  ).toBeNull();
  await account.client.rpc("end_workout", {
    p_session: abandoned.data,
    p_outcome: "abandoned",
  });
  const next = await account.client.rpc("start_ad_hoc_workout");
  const adds = await Promise.all(
    Array.from({ length: 3 }, () =>
      account.client.rpc("edit_workout", {
        p_session: next.data,
        p_operation: "add",
        p_exercise: exercise.id,
      }),
    ),
  );
  adds.forEach((r) => expect(r.error).toBeNull());
  expect(new Set(adds.map((r) => r.data)).size).toBe(1);
  const item = adds[0].data;
  const retried = await Promise.all(
    Array.from({ length: 3 }, () =>
      account.client.rpc("initialize_workout_sets", { p_item: item }),
    ),
  );
  retried.forEach((r) => {
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(4);
  });
  const defaults = await account.client
    .from("workout_sets")
    .select("*")
    .eq("workout_exercise_id", item)
    .order("position");
  expect(
    defaults.data?.every(
      (r) =>
        r.status === "pending" &&
        r.actual_reps === null &&
        r.actual_weight_kg === null &&
        r.completed_at === null,
    ),
  ).toBe(true);
  expect(defaults.data?.map((r) => r.set_type)).toEqual([
    "warm_up",
    "working",
    "working",
    "rest_pause",
  ]);
  const other = await verifiedAccount();
  expect(
    (
      await other.client.rpc("previous_exercise_sets", {
        p_exercise: exercise.id,
      })
    ).data,
  ).toEqual([]);
  const path = `/workout/${next.data}`;
  await page.goto(path);
  await openExerciseLogger(page);
  await expect(page.locator(".logged-set")).toHaveCount(4);
  for (const [i, weight] of ["50", "135", "52.5", "52.125"].entries()) {
    await expect(
      row(page, i).getByRole("textbox", { name: /weight/ }),
    ).toHaveValue(weight);
    await expect(
      row(page, i).getByRole("checkbox", { name: / complete$/ }),
    ).not.toBeChecked();
    await expect(row(page, i).locator(".set-save-state")).toContainText(
      "suggested",
    );
  }
  const before = defaults.data?.map((r) => ({
    id: r.id,
    weight: r.actual_weight_kg,
    suggestion: r.prescribed_weight_kg,
    revision: r.revision,
  }));
  for (const unit of ["kg", "lb"]) {
    await backToWorkoutHome(page);
    await page.getByRole("link", { name: "Back to app", exact: true }).click();
    await page.goto("/profile");
    await page.getByLabel("Weight Units", { exact: true }).selectOption(unit);
    await expect(page.getByRole("status")).toContainText("Saved");
    await page.reload();
    await expect(page.getByLabel("Weight Units", { exact: true })).toHaveValue(
      unit,
    );
    await page.goto(path);
    await openExerciseLogger(page);
    await expect(page.locator(".set-head")).toContainText(
      unit === "lb" ? "LBS" : "KG",
    );
    await expect(
      row(page, 0).getByRole("textbox", {
        name: unit === "lb" ? /weight in pounds/ : /weight in kilograms/,
      }),
    ).toBeVisible();
  }
  const after = await account.client
    .from("workout_sets")
    .select("*")
    .eq("workout_exercise_id", item)
    .order("position");
  expect(
    after.data?.map((r) => ({
      id: r.id,
      weight: r.actual_weight_kg,
      suggestion: r.prescribed_weight_kg,
      revision: r.revision,
    })),
  ).toEqual(before);
  await expect(
    row(page, 0).getByRole("textbox", { name: /weight/ }),
  ).toHaveValue("50");
  await row(page, 0).locator("summary").click();
  await row(page, 0)
    .getByRole("button", { name: /Delete/ })
    .click();
  await expect(page.locator(".logged-set")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".logged-set")).toHaveCount(3);
  await row(page, 0).getByRole("textbox", { name: /reps/ }).fill("9");
  await row(page, 0).getByRole("textbox", { name: /reps/ }).press("Tab");
  await saved(page, 0);
  await page.reload();
  await expect(row(page, 0).getByRole("textbox", { name: /reps/ })).toHaveValue(
    "9",
  );
  await expect(
    row(page, 0).getByRole("checkbox", { name: / complete$/ }),
  ).not.toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const target = await page
    .locator(".set-completion-control")
    .first()
    .boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(48);
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(
      row(page, 0).getByRole("textbox", { name: /weight/ }),
    ).toBeVisible();
  }
});
