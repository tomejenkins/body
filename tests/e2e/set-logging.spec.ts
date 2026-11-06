import {
  openExerciseLogger,
  backToWorkoutHome,
} from "./workout-screen-helpers";
import { expect, test, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(120000);
async function login(
  page: Page,
  account: Awaited<ReturnType<typeof verifiedAccount>>,
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
const row = (page: Page, n: number) => page.locator(".logged-set").nth(n);
async function saved(page: Page, n: number) {
  await expect(row(page, n).locator(".set-save-state")).toHaveText(/^Saved/);
}
test("three visible sets, same-session defaults, units, editing, types, ordering and partial finish", async ({
  page,
}) => {
  const account = await verifiedAccount();
  await login(page, account);
  await page.goto("/workout");
  await page
    .getByRole("button", { name: "Record Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/new$/);
  await page
    .getByRole("button", { name: "Start Blank Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  const path = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Add exercises", exact: true }).click();
  await page.getByRole("searchbox").fill("Barbell bench press");
  await page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Barbell bench press",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Select exercise", exact: true })
    .click();
  await page.getByRole("link", { name: /^Done · 1 selected$/ }).click();
  await openExerciseLogger(page);
  await expect(page.locator(".logged-set")).toHaveCount(3);
  await expect(
    page.getByRole("combobox", { name: "Weight unit", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".set-head")).toContainText("LBS");
  await saved(page, 0);
  await row(page, 0)
    .getByRole("textbox", { name: /weight/ })
    .fill("135");
  await row(page, 0).getByRole("textbox", { name: /reps/ }).fill("10");
  await row(page, 0)
    .getByRole("checkbox", { name: / complete$/ })
    .check();
  await saved(page, 0);
  for (let i = 1; i < 3; i++) {
    await row(page, i)
      .getByRole("textbox", { name: /weight/ })
      .fill("135");
    await row(page, i).getByRole("textbox", { name: /reps/ }).fill("10");
    await row(page, i).getByRole("textbox", { name: /reps/ }).press("Tab");
    await saved(page, i);
    await expect(
      row(page, i).getByRole("checkbox", { name: / complete$/ }),
    ).not.toBeChecked();
    if (i === 1) {
      await row(page, i)
        .getByRole("checkbox", { name: / complete$/ })
        .check();
      await saved(page, i);
    }
  }
  await page.reload();
  await expect(page.locator(".logged-set")).toHaveCount(3);
  await expect(page.locator(".logging-summary")).toContainText(
    "2 completed sets · 1 pending sets",
  );
  await row(page, 0)
    .getByRole("textbox", { name: /weight/ })
    .fill("140");
  await row(page, 0)
    .getByRole("textbox", { name: /weight/ })
    .press("Tab");
  await saved(page, 0);
  await row(page, 1)
    .getByRole("checkbox", { name: / complete$/ })
    .uncheck();
  await saved(page, 1);
  await row(page, 1).locator("summary").click();
  await row(page, 1)
    .getByRole("combobox", { name: /type/ })
    .selectOption("warm_up");
  await saved(page, 1);
  await expect(row(page, 1).locator(".set-number")).toHaveText("W");
  const third = await row(page, 2).getAttribute("data-set-id");
  await row(page, 2).locator("summary").click();
  await row(page, 2)
    .getByRole("button", { name: /Move .* up/ })
    .click();
  await expect(row(page, 1)).toHaveAttribute("data-set-id", third ?? "");
  await row(page, 1)
    .getByRole("button", { name: /Delete/ })
    .click();
  await expect(page.locator(".logged-set")).toHaveCount(2);
  await row(page, 1)
    .getByRole("textbox", { name: /weight/ })
    .fill("150");
  await row(page, 1).getByRole("textbox", { name: /reps/ }).fill("6");
  await page
    .getByRole("button", {
      name: "Add set to Barbell bench press",
      exact: true,
    })
    .click();
  await saved(page, 2);
  await expect(
    row(page, 2).getByRole("textbox", { name: /weight/ }),
  ).toHaveValue("150");
  await expect(row(page, 2).getByRole("textbox", { name: /reps/ })).toHaveValue(
    "6",
  );
  await expect(row(page, 2).locator("summary")).toContainText(
    "Normal working set",
  );
  const firstId = await row(page, 0).getAttribute("data-set-id");
  const before = await account.client
    .from("workout_sets")
    .select("actual_weight_kg,revision")
    .eq("id", firstId)
    .single();
  await backToWorkoutHome(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Profile", exact: true })
    .click();
  await page.getByLabel("Weight Units", { exact: true }).selectOption("kg");
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.goto(path);
  await openExerciseLogger(page);
  await expect(page.locator(".set-head")).toContainText("KG");
  const after = await account.client
    .from("workout_sets")
    .select("actual_weight_kg,revision")
    .eq("id", firstId)
    .single();
  expect(after.data).toEqual(before.data);
  await page.reload();
  await expect(page.locator(".set-head")).toContainText("KG");
  await backToWorkoutHome(page);
  await page
    .getByRole("checkbox", { name: /Finish without completing all sets/ })
    .check();
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/message=completed/);
  await page.goto(path);
  await expect(page.locator(".logging-summary")).toContainText(
    "1 completed sets · 2 pending sets",
  );
  await expect(page.getByRole("textbox", { name: /weight/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add set to/ })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("bodyweight, visible save failure, navigation guard, retained edits and concurrent conflict", async ({
  page,
}) => {
  const account = await verifiedAccount();
  const session = await account.client.rpc("start_ad_hoc_workout");
  const exercise = catalog.exercises.find((e) => e.slug === "push_up");
  if (!exercise) throw new Error("Missing fixture");
  await account.client.rpc("edit_workout", {
    p_session: session.data,
    p_operation: "add",
    p_exercise: exercise.id,
  });
  await login(page, account);
  const path = `/workout/${session.data}`;
  await page.goto(path);
  await openExerciseLogger(page);
  await expect(page.locator(".logged-set")).toHaveCount(3);
  await saved(page, 0);
  await expect(page.getByRole("textbox", { name: /weight/ })).toHaveCount(0);
  await row(page, 0).getByRole("textbox", { name: /reps/ }).fill("12");
  await row(page, 0)
    .getByRole("checkbox", { name: / complete$/ })
    .check();
  await saved(page, 0);
  const id = await row(page, 0).getAttribute("data-set-id");
  const existing = await account.client
    .from("workout_sets")
    .select("*")
    .eq("id", id)
    .single();
  expect(existing.data?.actual_weight_kg).toBeNull();
  await row(page, 0).getByRole("textbox", { name: /reps/ }).fill("15");
  const remote = await account.client.rpc("log_workout_set", {
    p_item: existing.data?.workout_exercise_id,
    p_id: id,
    p_operation: "save",
    p_revision: existing.data?.revision,
    p_mutation: crypto.randomUUID(),
    p_reps: 20,
    p_mode: "bodyweight",
    p_completed: true,
  });
  expect(remote.error).toBeNull();
  await row(page, 0).getByRole("textbox", { name: /reps/ }).press("Tab");
  await expect(row(page, 0).locator(".set-error")).toContainText(
    "changed elsewhere",
  );
  await expect(row(page, 0).getByRole("textbox", { name: /reps/ })).toHaveValue(
    "15",
  );
  await row(page, 0)
    .getByRole("button", { name: "Retry my values", exact: true })
    .click();
  await saved(page, 0);
  await page.route("**/workout/**", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await row(page, 0).getByRole("textbox", { name: /reps/ }).fill("18");
  await row(page, 0).getByRole("textbox", { name: /reps/ }).press("Tab");
  await expect(row(page, 0).locator(".set-save-state")).toHaveText(
    /^Not saved/,
  );
  await expect(row(page, 0).getByRole("textbox", { name: /reps/ })).toHaveValue(
    "18",
  );
  await expect(
    page.getByRole("button", { name: "Finish workout", exact: true }),
  ).toHaveCount(0);
  await backToWorkoutHome(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Profile", exact: true })
    .click();
  await expect(page.locator(".draft-warning")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(path + "$"));
  await page.getByRole("button", { name: "Stay here", exact: true }).click();
  await openExerciseLogger(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(row(page, 0).getByRole("textbox", { name: /reps/ })).toHaveValue(
    "18",
  );
  await expect(row(page, 0).locator(".set-error")).toContainText(/recovered/i);
  await page.unroute("**/workout/**");
  await row(page, 0)
    .getByRole("button", { name: "Retry save", exact: true })
    .click();
  await saved(page, 0);
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let held = false;
  await page.route("**/workout/**", async (route) => {
    if (route.request().method() === "POST" && !held) {
      held = true;
      arrived();
      await gate;
    }
    await route.continue();
  });
  await row(page, 0).getByRole("textbox", { name: /reps/ }).fill("21");
  await row(page, 0).getByRole("textbox", { name: /reps/ }).press("Tab");
  await intercepted;
  await row(page, 0).getByRole("textbox", { name: /reps/ }).fill("22");
  release();
  await expect(row(page, 0).locator(".set-save-state")).toHaveText(
    /^Unsaved changes/,
  );
  await expect(row(page, 0).getByRole("textbox", { name: /reps/ })).toHaveValue(
    "22",
  );
  await page.unroute("**/workout/**");
  await row(page, 0).getByRole("textbox", { name: /reps/ }).press("Tab");
  await saved(page, 0);
  const result = await account.client
    .from("workout_sets")
    .select("actual_reps,actual_weight_kg")
    .eq("id", id)
    .single();
  expect(result.data).toMatchObject({
    actual_reps: 22,
    actual_weight_kg: null,
  });
});
