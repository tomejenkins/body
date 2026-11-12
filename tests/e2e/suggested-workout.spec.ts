import { openWorkoutManagement } from "./workout-screen-helpers";
import { test, expect, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
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
const cards = (page: Page) => page.locator(".workout-movement-card");
test("two focus selections create five unbound movements; logger, back, safe movement change and removal persist", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await login(page, a);
  await page
    .getByRole("link", { name: "Start Other Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/workout\/new$/);
  await page.getByRole("radio", { name: "Chest", exact: true }).check();
  const secondary = page.getByLabel(/Secondary Focus/);
  await expect(secondary.locator(`option[value="${"chest"}"]`)).toBeDisabled();
  await secondary.selectOption("triceps");
  await expect(page.getByRole("status")).toContainText("5 suggested movements");
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  const session = new URL(page.url()).pathname.split("/").pop()!;
  await expect(cards(page)).toHaveCount(5);
  await expect(page.locator(".logged-set")).toHaveCount(0);
  expect(
    (
      await a.client
        .from("workout_exercises")
        .select("id")
        .eq("workout_session_id", session)
    ).data,
  ).toEqual([]);
  await cards(page)
    .first()
    .getByRole("button", { name: /^Choose exercise/, exact: true })
    .click();
  await expect(page.locator(".movement-carousel")).toHaveCount(1);
  await page.locator(".movement-carousel button").first().click();
  await expect(page).toHaveURL(/exercise=/);
  await expect(page.locator(".logged-set")).toHaveCount(3);
  if (info.project.name === "mobile")
    await expect(
      page.getByRole("navigation", { name: "Main navigation", exact: true }),
    ).toBeHidden();
  const row = page.locator(".logged-set").first();
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue("");
  await row.getByRole("textbox", { name: /weight/ }).fill("50");
  await row.getByRole("textbox", { name: /reps/ }).fill("8");
  await row.getByRole("checkbox", { name: / complete$/ }).click();
  await expect(row.locator(".set-save-state")).toHaveText(/^Saved/);
  const setId = await row.getAttribute("data-set-id");
  const before = (
    await a.client
      .from("workout_sets")
      .select("actual_reps,actual_weight_kg,workout_exercise_id")
      .eq("id", setId)
      .single()
  ).data;
  await page.goBack();
  await expect(
    page.getByRole("region", { name: "Workout Home", exact: true }),
  ).toBeVisible();
  await expect(cards(page).first()).toContainText("In Progress");
  await openWorkoutManagement(page);
  await cards(page)
    .first()
    .getByRole("button", { name: /^Manage / })
    .click();
  const form = page.getByRole("dialog");
  const option = await form
    .locator('select option:not([value=""])')
    .first()
    .getAttribute("value");
  await form.getByRole("combobox").selectOption(option!);
  await form
    .getByRole("button", { name: "Update movement", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText("Keep recorded");
  await form.getByRole("checkbox", { name: /Keep recorded movement/ }).check();
  await form
    .getByRole("button", { name: "Update movement", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(6);
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("actual_reps,actual_weight_kg,workout_exercise_id")
        .eq("id", setId)
        .single()
    ).data,
  ).toEqual(before);
  await cards(page)
    .last()
    .getByRole("button", { name: /^Manage / })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove movement", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(5);
  await page.reload();
  await expect(cards(page)).toHaveCount(5);
  await openWorkoutManagement(page);
  await page.getByRole("button", { name: "Add movement", exact: true }).click();
  const add = page.getByRole("dialog");
  const addChoice = await add
    .locator('select option:not([value=""])')
    .first()
    .getAttribute("value");
  await add.getByRole("combobox").selectOption(addChoice!);
  await add.getByRole("button", { name: "Add movement", exact: true }).click();
  await expect(cards(page)).toHaveCount(6);
});
test("single muscle, limited catalog and one-tap blank starts remain lightweight", async ({
  page,
}) => {
  const a = await verifiedAccount();
  await login(page, a);
  await page.goto("/workout/new");
  await page.getByRole("radio", { name: "Chest", exact: true }).check();
  await expect(page.getByRole("status")).toContainText("4 suggested movements");
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(4);
  let session = new URL(page.url()).pathname.split("/").pop()!;
  await a.client.rpc("end_workout", {
    p_session: session,
    p_outcome: "abandoned",
  });
  await page.goto("/workout/new");
  await page.getByRole("radio", { name: "Biceps", exact: true }).check();
  await expect(page.getByRole("status")).toContainText("3 suggested movements");

  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(3);
  session = new URL(page.url()).pathname.split("/").pop()!;
  await a.client.rpc("end_workout", {
    p_session: session,
    p_outcome: "abandoned",
  });
  await page.goto("/workout/new");
  await page.getByText("More options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Start Blank Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  await expect(cards(page)).toHaveCount(0);
  await expect(page.locator(".logged-set")).toHaveCount(0);
  await expect(page.getByLabel("Primary Focus", { exact: true })).toHaveCount(
    0,
  );
});
test("emphasis persists distinct intents inside a shared pattern and preserves unbound start", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await login(page, a);
  await page.goto("/workout/new");
  await page.getByRole("radio", { name: "Legs", exact: true }).check();
  await page.getByLabel(/Emphasis/).selectOption("calves");
  const startButton = page.getByRole("button", {
    name: "Start Workout",
    exact: true,
  });
  await expect(startButton).toBeInViewport();
  if (info.project.name === "mobile") {
    const buttonBox = await startButton.boundingBox();
    const navigationBox = await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .boundingBox();
    expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(
      navigationBox!.y,
    );
  }
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.screenshot({
      path: info.outputPath(`emphasis-setup-${colorScheme}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await expect(page.getByRole("status")).toContainText("4 suggested movements");
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(4);
  const session = new URL(page.url()).pathname.split("/").pop()!;
  const saved = await a.client
    .from("workout_movements")
    .select("slot_snapshot")
    .eq("workout_session_id", session)
    .order("position");
  expect(saved.error).toBeNull();
  expect(saved.data!.map((m) => m.slot_snapshot.intent)).toEqual([
    "calf_straight",
    "calf_bent",
    "squat",
    "hinge",
  ]);
  expect(saved.data![0].slot_snapshot.movement_pattern_id).toBe(
    saved.data![1].slot_snapshot.movement_pattern_id,
  );
  await expect(cards(page).first()).toContainText("Straight-Knee Calf Raise");
  await expect(cards(page).nth(1)).toContainText("Bent-Knee Calf Raise");
  await page.reload();
  await expect(cards(page)).toHaveCount(4);
  const actual = await a.client
    .from("workout_exercises")
    .select("id")
    .eq("workout_session_id", session);
  expect(actual.data).toEqual([]);
  await cards(page)
    .nth(1)
    .getByRole("button", { name: /^Choose exercise/, exact: true })
    .click();
  const tiles = page.locator(".movement-carousel button");
  await expect(tiles.first()).toContainText("Seated calf raise machine");
  await expect(tiles.first().locator(".movement-match")).toHaveCount(0);
});
