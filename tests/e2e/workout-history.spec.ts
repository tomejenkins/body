import {
  openExerciseLogger,
  backToWorkoutHome,
} from "./workout-screen-helpers";
import { expect, test, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
import { localTimestamp } from "../../src/features/history/model";
test.use({ timezoneId: "America/Los_Angeles" });
test.setTimeout(180000);
const exercise = (slug: string) => {
  const e = catalog.exercises.find((e) => e.slug === slug);
  if (!e) throw Error("Missing catalog fixture");
  return e.id;
};
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
test("paginated private history, mixed bodyweight loads, snapshots and Look Back", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const account = await verifiedAccount();
  await login(page, account);
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "Your story starts here." }),
  ).toBeVisible();
  for (let i = 0; i < 22; i++) {
    const w = await account.client.rpc("start_ad_hoc_workout");
    expect(w.error).toBeNull();
    expect(
      (
        await account.client.rpc("end_workout", {
          p_session: w.data,
          p_outcome: "completed",
        })
      ).error,
    ).toBeNull();
  }
  await page.goto("/workout");
  await expect(
    page.getByRole("button", { name: /Scheduled Workout/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Record Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/new$/);
  await page
    .getByRole("button", { name: "Start Blank Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  for (const slug of ["push_up", "barbell_bench_press"])
    expect(
      (
        await account.client.rpc("edit_workout", {
          p_session: id,
          p_operation: "add",
          p_exercise: exercise(slug),
        })
      ).error,
    ).toBeNull();
  await page.reload();
  await openExerciseLogger(page, "Push-up");
  const push = page.locator(
    `.workout-item[data-exercise-id="${exercise("push_up")}"]`,
  );
  const bench = page.locator(
    `.workout-item[data-exercise-id="${exercise("barbell_bench_press")}"]`,
  );
  await expect(push.locator(".logged-set")).toHaveCount(3);
  await expect(push.getByRole("textbox", { name: /weight/ })).toHaveCount(0);
  await expect(push.locator(".set-grid.reps-first").first()).toBeVisible();
  const first = push.locator(".logged-set").nth(0),
    second = push.locator(".logged-set").nth(1);
  await first.getByRole("textbox", { name: /reps/ }).fill("10");
  await first.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(first.locator(".set-save-state")).toHaveText(/^Saved/);
  await second.getByRole("textbox", { name: /reps/ }).fill("8");
  await second
    .getByRole("button", { name: "+ Add weight", exact: true })
    .click();
  await expect(second.locator(".set-save-state")).toHaveText(/^Saved/);
  await second.getByRole("textbox", { name: /weight/ }).fill("25");
  await second.getByRole("textbox", { name: /reps/ }).fill("8");
  await second.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(second.locator(".set-save-state")).toHaveText(/^Saved/);
  await backToWorkoutHome(page);
  await openExerciseLogger(page, "Barbell bench press");
  const warm = bench.locator(".logged-set").first();
  await warm.getByRole("textbox", { name: /weight/ }).fill("50");
  await warm.getByRole("textbox", { name: /reps/ }).fill("10");
  await warm.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(warm.locator(".set-save-state")).toHaveText(/^Saved/);
  await warm.locator("summary").click();
  await warm.getByRole("combobox", { name: /type/ }).selectOption("warm_up");
  await expect(warm.locator(".set-save-state")).toHaveText(/^Saved/);
  await backToWorkoutHome(page);
  await page
    .getByRole("checkbox", { name: /Finish without completing all sets/ })
    .check();
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/message=completed/);
  await page.goto(`/history/${id}`);
  await expect(
    page.getByText("Saved workout · Read only", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".history-detail >li h2")).toHaveText([
    "Push-up",
    "Barbell bench press",
  ]);
  await expect(
    page.getByText("10 reps · Bodyweight", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("+25 lb × 8 · Added weight", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("50 lb × 10", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const saved = await account.client
    .from("workout_sessions")
    .select("started_at")
    .eq("id", id)
    .single();
  await expect(
    page
      .getByText(
        localTimestamp(saved.data?.started_at, "America/Los_Angeles"),
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(
    /UTC|Ad-hoc|Tier [123]|Primary tier|Secondary tier|ranking score/,
  );
  await page.goto(`/exercises/${exercise("push_up")}/history`);
  await expect(
    page.getByText("1 completed workouts with performed sets", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("10 reps · Bodyweight", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("+25 lb × 8 · Added weight", { exact: true }),
  ).toBeVisible();
  await page.goto(`/exercises/${exercise("chin_up")}/history`);
  await expect(
    page.getByRole("heading", { name: "No completed performances yet." }),
  ).toBeVisible();
  await page.goto(`/exercises/${exercise("push_up")}`);
  await page.getByRole("link", { name: "Look Back", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  const abandoned = await account.client.rpc("start_ad_hoc_workout");
  await account.client.rpc("end_workout", {
    p_session: abandoned.data,
    p_outcome: "abandoned",
  });
  await page.goto("/history");
  await expect(page.locator(".history-list >li")).toHaveCount(20);
  await expect(page.locator(".history-list")).toContainText(
    "2 completed working sets · 1 warm-up sets · 3 incomplete sets",
  );
  await page
    .getByRole("link", { name: "Older workouts →", exact: true })
    .click();
  await expect(page.locator(".history-list >li")).toHaveCount(4);
  await expect(
    page.getByRole("link", { name: "Older workouts →", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Newest workouts", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "History filters" })
    .getByRole("link", { name: "Abandoned", exact: true })
    .click();
  await expect(page.locator(".history-list >li")).toHaveCount(1);
  const other = await verifiedAccount();
  const foreign = await other.client.rpc("start_ad_hoc_workout");
  await page.goto(`/history/${foreign.data}`);
  await expect(
    page.getByText("This page could not be found.", { exact: false }),
  ).toBeVisible();
  expect(
    (
      await other.client.rpc("exercise_history", {
        p_exercise: exercise("push_up"),
      })
    ).data?.total_sessions,
  ).toBe(0);
  expect(errors).toEqual([]);
});
test("unsupported measurements are explicit and archived custom history stays private", async ({
  page,
}) => {
  const account = await verifiedAccount();
  await login(page, account);
  const w = await account.client.rpc("start_ad_hoc_workout");
  for (const slug of ["forearm_plank", "assisted_pull_up_machine"])
    await account.client.rpc("edit_workout", {
      p_session: w.data,
      p_operation: "add",
      p_exercise: exercise(slug),
    });
  await page.goto(`/workout/${w.data}`);
  await openExerciseLogger(page, "Forearm plank");
  await expect(
    page.getByText(/Duration tracking is not available yet/),
  ).toBeVisible();
  await backToWorkoutHome(page);
  await openExerciseLogger(page, "Assisted pull-up machine");
  await expect(
    page.getByText(/Assistance tracking is not available yet/),
  ).toBeVisible();
  for (const checkbox of await page
    .locator(".logged-set input[type=checkbox]")
    .all())
    await expect(checkbox).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "+ Add weight", exact: true }),
  ).toHaveCount(0);
  await account.client.rpc("end_workout", {
    p_session: w.data,
    p_outcome: "abandoned",
  });
  const custom = await account.client.rpc("save_custom_exercise", {
    p_id: null,
    p_name: "Original private lift",
    p_type: "compound",
    p_primary_pattern: catalog.movementPatterns.find(
      (p) => p.slug === "horizontal_push",
    )?.id,
    p_secondary_patterns: [],
    p_primary_muscles: catalog.muscleGroups.find((m) => m.slug === "pectorals")
      ? [catalog.muscleGroups.find((m) => m.slug === "pectorals")?.id]
      : [],
    p_secondary_muscles: [],
    p_equipment: [
      catalog.equipmentTypes.find((e) => e.slug === "dumbbell")?.id,
    ],
    p_instructions: "Local test",
  });
  expect(custom.error).toBeNull();
  const s = await account.client.rpc("start_ad_hoc_workout");
  const item = await account.client.rpc("edit_workout", {
    p_session: s.data,
    p_operation: "add",
    p_exercise: custom.data,
  });
  const rows = await account.client
    .from("workout_sets")
    .select("*")
    .eq("workout_exercise_id", item.data)
    .order("position");
  const row = rows.data?.[0];
  if (!row) throw Error("Missing fixture");
  expect(
    (
      await account.client.rpc("log_workout_set", {
        p_item: item.data,
        p_id: row.id,
        p_operation: "save",
        p_revision: 0,
        p_mutation: crypto.randomUUID(),
        p_reps: 8,
        p_weight: 22.68,
        p_completed: true,
        p_entered_weight: 50,
        p_entered_unit: "lb",
      })
    ).error,
  ).toBeNull();
  await account.client.rpc("end_workout", {
    p_session: s.data,
    p_outcome: "completed",
  });
  expect(
    (
      await account.client
        .from("exercises")
        .update({
          name: "Renamed private lift",
          archived_at: new Date().toISOString(),
        })
        .eq("id", custom.data)
    ).error,
  ).toBeNull();
  await page.goto(`/history/${s.data}`);
  await expect(
    page.getByRole("heading", { name: "Original private lift", exact: true }),
  ).toBeVisible();
  await page.goto(`/exercises/${custom.data}/history`);
  await expect(
    page.getByRole("heading", { name: "Renamed private lift", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Original private lift", exact: true }),
  ).toBeVisible();
  await page.goto(`/exercises/${custom.data}`);
  await expect(
    page.getByText("Archived · Read only", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Look Back", exact: true }),
  ).toBeVisible();
  const other = await verifiedAccount();
  expect(
    (await other.client.rpc("exercise_history", { p_exercise: custom.data }))
      .data?.total_sessions,
  ).toBe(0);
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
