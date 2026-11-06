import { test, expect, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
const muscle = (slug: string) =>
  catalog.muscleGroups.find((m) => m.slug === slug)!.id;
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
test("two muscle selections create four unbound movements; logger, back, safe movement change and removal persist", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await login(page, a);
  await page
    .getByRole("button", { name: "Record Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/workout\/new$/);
  await page
    .getByLabel("Primary Muscle Group", { exact: true })
    .selectOption(muscle("pectorals"));
  const secondary = page.getByLabel(/Secondary Muscle Group/);
  await expect(
    secondary.locator(`option[value="${muscle("pectorals")}"]`),
  ).toBeDisabled();
  await secondary.selectOption(muscle("triceps"));
  await expect(page.getByRole("status")).toContainText("4 suggested movements");
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  const session = new URL(page.url()).pathname.split("/").pop()!;
  await expect(cards(page)).toHaveCount(4);
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
    .getByRole("button", { name: "Choose exercise", exact: true })
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
  await row.getByRole("checkbox", { name: / complete$/ }).check();
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
  await cards(page).first().locator(".suggested-controls summary").click();
  const form = cards(page).first().locator(".suggested-controls form");
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
  await expect(cards(page)).toHaveCount(5);
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("actual_reps,actual_weight_kg,workout_exercise_id")
        .eq("id", setId)
        .single()
    ).data,
  ).toEqual(before);
  await cards(page).last().locator(".suggested-controls summary").click();
  await cards(page)
    .last()
    .getByRole("button", { name: "Update movement", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(4);
  await page.reload();
  await expect(cards(page)).toHaveCount(4);
  const add = page.locator(".workout-toolbar .suggested-controls");
  await add.locator("summary").click();
  const addChoice = await add
    .locator('select option:not([value=""])')
    .first()
    .getAttribute("value");
  await add.getByRole("combobox").selectOption(addChoice!);
  await add.getByRole("button", { name: "Add movement", exact: true }).click();
  await expect(cards(page)).toHaveCount(5);
});
test("single muscle, limited catalog and one-tap blank starts remain lightweight", async ({
  page,
}) => {
  const a = await verifiedAccount();
  await login(page, a);
  await page.goto("/workout/new");
  await page
    .getByLabel("Primary Muscle Group", { exact: true })
    .selectOption(muscle("pectorals"));
  await expect(page.getByRole("status")).toContainText("2 suggested movements");
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(2);
  let session = new URL(page.url()).pathname.split("/").pop()!;
  await a.client.rpc("end_workout", {
    p_session: session,
    p_outcome: "abandoned",
  });
  await page.goto("/workout/new");
  await page
    .getByLabel("Primary Muscle Group", { exact: true })
    .selectOption(muscle("biceps"));
  await expect(page.getByRole("status")).toContainText("1 suggested movement");
  await expect(page.getByRole("status")).toContainText(
    "Fewer supported movements",
  );
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(1);
  session = new URL(page.url()).pathname.split("/").pop()!;
  await a.client.rpc("end_workout", {
    p_session: session,
    p_outcome: "abandoned",
  });
  await page.goto("/workout");
  await page
    .getByRole("button", { name: "Start Blank Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  await expect(cards(page)).toHaveCount(0);
  await expect(page.locator(".logged-set")).toHaveCount(0);
  await expect(
    page.getByLabel("Primary Muscle Group", { exact: true }),
  ).toHaveCount(0);
});
