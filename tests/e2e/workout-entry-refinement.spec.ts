import { test, expect } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import {
  loginSelection,
  selectionProgram,
  completeSelection,
} from "./selection-helpers";
test.setTimeout(120000);
test.use({ actionTimeout: 10000 });
const cards = (page: import("@playwright/test").Page) =>
  page.locator(".workout-movement-card");
test("two entry paths, secondary alternatives, direct setup and safe resume", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a);
  await a.client.rpc("end_workout", {
    p_session: p.session,
    p_outcome: "abandoned",
  });
  await loginSelection(page, a);
  await page.goto("/workout");
  const rec = page.getByRole("region", {
    name: "Recommended workout",
    exact: true,
  });
  await expect(
    rec.getByRole("button", { name: "Start Workout", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start Other Workout", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /Record Workout|Start Blank/ }),
  ).toHaveCount(0);
  const alternatives = page.locator(".program-workout-options");
  await expect(alternatives).not.toHaveAttribute("open", "");
  await alternatives.locator(":scope > summary").click();
  await expect(
    alternatives.getByRole("button", { name: "Start Training 2", exact: true }),
  ).toBeVisible();
  await alternatives.locator(":scope > summary").click();
  await page.screenshot({
    path: info.outputPath("entry-program.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Start Other Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/workout\/new$/);
  await expect(
    page.getByRole("heading", { name: "What are we training today?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Recommended workout" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Your Favorites" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Back to Workout" }).click();
  await rec.getByRole("button", { name: "Start Workout", exact: true }).click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto("/workout");
  await expect(
    page.getByRole("link", { name: "Resume Workout", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start Other Workout", exact: true }),
  ).toHaveCount(0);
  await expect(
    rec.getByRole("button", { name: "Start Workout", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("entry-resume.png"),
    fullPage: true,
  });
  await page.goto("/workout/new");
  await expect(page).toHaveURL(new RegExp(id));
});
test("Full Body creates five unselected categories and muscle controls reset across modes", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  await page.goto("/workout");
  await expect(
    page.getByRole("region", { name: "Recommended workout" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Browse Programs" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("entry-no-program.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Start Other Workout", exact: true })
    .click();
  for (const width of [375, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("radio", { name: "Chest", exact: true }).check();
  await page.getByLabel(/Secondary Focus/).selectOption("triceps");
  await page.getByLabel(/Emphasis/).selectOption("upper_chest");
  await page.screenshot({
    path: info.outputPath("setup-muscle.png"),
    fullPage: true,
  });
  await page.getByRole("radio", { name: "Full Body", exact: true }).check();
  await expect(page.getByLabel(/Secondary Focus|Emphasis/)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("5 suggested movements");
  await page.getByRole("radio", { name: "Chest", exact: true }).check();
  await expect(page.getByLabel(/Secondary Focus/)).toHaveValue("");
  await expect(page.getByLabel(/Emphasis/)).toHaveValue("balanced");
  await page.getByRole("radio", { name: "Full Body", exact: true }).check();
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.screenshot({
      path: info.outputPath(`setup-full-body-${theme}.png`),
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Choose by Exercise Instead", exact: true })
    .click();
  await page.getByLabel("Search exercises").fill("press");
  await page
    .getByRole("button", { name: "Movement Focus", exact: true })
    .click();
  expect((await a.client.from("workout_sessions").select("id")).data).toEqual(
    [],
  );
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(5);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const rows = await a.client
    .from("workout_movements")
    .select("suggested_intent")
    .eq("workout_session_id", id)
    .order("position");
  expect(rows.data!.map((r) => r.suggested_intent)).toEqual([
    "squat",
    "hinge",
    "flat_press",
    "row",
    "crunch",
  ]);
  expect(
    (
      await a.client
        .from("workout_exercises")
        .select("id")
        .eq("workout_session_id", id)
    ).data,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("full-body-home.png"),
    fullPage: true,
  });
  await cards(page)
    .first()
    .getByRole("button", { name: /Choose exercise/ })
    .click();
  await page.locator(".movement-carousel button").first().click();
  await expect(page.locator(".logged-set")).toHaveCount(3);
});
test("exercise-first recents/search retain deliberate order and duplicate intents with normal logging", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 3, 1);
  await completeSelection(a, p.session, p.exercise, [12]);
  const before = (await a.client.rpc("workout_start_options")).data.assignment;
  await loginSelection(page, a);
  await page.goto("/workout/new");
  await page
    .getByRole("button", { name: "Choose by Exercise Instead" })
    .click();
  const recent = page.getByRole("region", { name: "Recent exercises" });
  await expect(
    recent.getByRole("button", {
      name: "Add Barbell bench press",
      exact: true,
    }),
  ).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("exercise-recents.png"),
    fullPage: true,
  });
  await recent
    .getByRole("button", { name: "Add Barbell bench press", exact: true })
    .click();
  const search = page.getByLabel("Search exercises");
  await search.fill("DUMBBELL BENCH PRESS");
  await search.focus();
  await page.keyboard.press("Tab");
  await expect(
    page
      .getByRole("region", { name: "Search results" })
      .getByRole("button")
      .first(),
  ).toBeFocused();
  await expect(
    page
      .getByRole("region", { name: "Search results" })
      .getByRole("button", { name: "Add Dumbbell bench press", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add Dumbbell bench press", exact: true })
    .click();
  await search.fill("no-such-exercise-xyz");
  await expect(page.getByRole("status")).toContainText(
    "No available exercises",
  );
  await search.fill("squat");
  await page.screenshot({
    path: info.outputPath("exercise-search.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Move Dumbbell bench press up", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove Barbell bench press", exact: true })
    .click();
  await search.fill("barbell bench press");
  await page
    .getByRole("button", { name: "Add Barbell bench press", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Movement Focus", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose by Exercise Instead" })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected exercises" }).locator("li"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(2);
  await page.screenshot({
    path: info.outputPath("exercise-ready.png"),
    fullPage: true,
  });
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const entries = (
    await a.client
      .from("workout_exercises")
      .select("id,exercise_name_snapshot,exercise_id")
      .eq("workout_session_id", id)
      .order("position")
  ).data!;
  expect(entries.map((e) => e.exercise_name_snapshot)).toEqual([
    "Dumbbell bench press",
    "Barbell bench press",
  ]);
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("status,actual_reps,actual_weight_kg")
        .in(
          "workout_exercise_id",
          entries.map((e) => e.id),
        )
    ).data!.every(
      (s) =>
        s.status === "pending" &&
        s.actual_reps === null &&
        s.actual_weight_kg === null,
    ),
  ).toBe(true);
  expect((await a.client.rpc("workout_start_options")).data.assignment).toEqual(
    before,
  );
  await cards(page)
    .first()
    .getByRole("link", { name: "Open exercise logger" })
    .click();
  const row = page.locator(".logged-set").first();
  await row.getByRole("textbox", { name: /weight/ }).fill("40");
  await row.getByRole("textbox", { name: /reps/ }).fill("8");
  await row.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(row.locator(".set-save-state")).toHaveText(/^Saved/);
  const retry = await a.client.rpc("start_exercise_workout", {
    p_exercises: entries.map((e) => e.exercise_id),
    p_request: crypto.randomUUID(),
  });
  expect(retry.error?.code).toBe("23514");
  await a.client.rpc("end_workout", { p_session: id, p_outcome: "abandoned" });
  const nonces = [crypto.randomUUID(), crypto.randomUUID()];
  const race = await Promise.all(
    nonces.map((p_request) =>
      a.client.rpc("start_exercise_workout", {
        p_exercises: entries.map((e) => e.exercise_id),
        p_request,
      }),
    ),
  );
  expect(race.filter((r) => !r.error)).toHaveLength(1);
  expect(race.filter((r) => r.error?.code === "23514")).toHaveLength(1);
  const winner = race.findIndex((r) => !r.error),
    repeated = await a.client.rpc("start_exercise_workout", {
      p_exercises: entries.map((e) => e.exercise_id),
      p_request: nonces[winner],
    });
  expect(repeated.data).toBe(race[winner].data);
  expect((await a.client.rpc("workout_start_options")).data.assignment).toEqual(
    before,
  );
});
