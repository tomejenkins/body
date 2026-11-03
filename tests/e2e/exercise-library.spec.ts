import { expect, test } from "@playwright/test";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
import { loginForNavigation, verifiedAccount } from "./auth-helpers";
const pattern = (slug: string) =>
  catalog.movementPatterns.find((t) => t.slug === slug)?.id ?? "missing";
const muscle = (slug: string) =>
  catalog.muscleGroups.find((t) => t.slug === slug)?.id ?? "missing";
let clientErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  clientErrors = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("hydrated"))
      clientErrors.push(message.text());
  });
});
test.afterEach(() => expect(clientErrors).toEqual([]));
test("search, combined filters, hard type constraints and favorites", async ({
  page,
}) => {
  await loginForNavigation(page);
  await page.goto("/workout");
  await page.getByRole("link", { name: "Explore exercise library" }).click();
  await expect(
    page.getByRole("heading", { name: "Find your movement." }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Workout", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("searchbox").focus();
  await page.keyboard.type("Dumbbell chest fly");
  const card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Dumbbell chest fly",
      exact: true,
    }),
  });
  await expect(page.locator("article")).toHaveCount(1);
  await card
    .getByRole("button", { name: "Favorite Dumbbell chest fly", exact: true })
    .click();
  await expect(
    card.getByRole("button", {
      name: "Unfavorite Dumbbell chest fly",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page
    .getByText("Refine by movement, muscle or equipment", { exact: true })
    .click();
  await page.getByLabel("Favorites", { exact: true }).check();
  await expect(
    page.locator("article").filter({ hasText: "Dumbbell chest fly" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByLabel("Muscle group", { exact: true })
    .selectOption(muscle("pectorals"));
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("isolation");
  await page
    .locator("summary")
    .filter({ hasText: "Equipment available" })
    .click();
  await page.getByLabel("Dumbbell", { exact: true }).check();
  await page.getByLabel("Flat bench", { exact: true }).check();
  await page
    .getByLabel("Movement pattern", { exact: true })
    .selectOption(pattern("horizontal_adduction"));
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article h2")).toHaveText("Dumbbell chest fly");
  await page
    .getByLabel("Movement pattern", { exact: true })
    .selectOption(pattern("horizontal_push"));
  await expect(
    page.getByRole("heading", { name: "No matching exercises" }),
  ).toBeVisible();
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("compound");
  await expect(
    page.locator("article").filter({ hasText: "Dumbbell bench press" }).first(),
  ).toBeVisible();
  await expect(
    page.locator("article").filter({ hasText: "Dumbbell chest fly" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("custom creation, typed edits, real recents, archiving and private boundaries", async ({
  page,
}) => {
  const account = await loginForNavigation(page);
  await page.goto("/exercises");
  await expect(
    page.getByText(
      "Your recent selections will appear after you log workouts.",
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Create custom exercise", exact: true })
    .click();
  await page
    .getByLabel("Exercise name", { exact: true })
    .fill("Local test leg extension");
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("isolation");
  await page
    .getByLabel("Primary movement pattern", { exact: true })
    .selectOption(pattern("knee_extension"));
  await page
    .getByRole("button", { name: "Save exercise", exact: true })
    .click();
  await expect(
    page.locator(".exercise-editor").getByRole("alert"),
  ).toContainText(
    "Choose a primary movement, primary muscles and required equipment",
  );
  await expect(page.getByLabel("Exercise name", { exact: true })).toHaveValue(
    "Local test leg extension",
  );
  await page
    .getByRole("group", { name: "Primary muscles · required", exact: true })
    .getByLabel("Quadriceps", { exact: true })
    .check();
  await page
    .getByRole("group", { name: "Required equipment · required", exact: true })
    .getByLabel("Resistance band", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save exercise", exact: true })
    .click();
  await page.getByRole("link", { name: "View exercise", exact: true }).click();
  await expect(page).toHaveURL(/\/exercises\/[a-f0-9-]{36}$/);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  if (!id) throw new Error("Missing exercise ID");
  await expect(
    page.locator("dd").filter({ hasText: /^isolation$/ }),
  ).toBeVisible();
  await page
    .getByLabel("Recommendation preference", { exact: true })
    .selectOption("preferred");
  await page
    .getByRole("button", { name: "Save preference", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Preference saved.");
  await page
    .getByRole("link", { name: "Edit custom exercise", exact: true })
    .click();
  await expect(page.getByLabel("Exercise type", { exact: true })).toHaveValue(
    "isolation",
  );
  await page
    .getByLabel("Exercise name", { exact: true })
    .fill("Local test quad extension");
  await page
    .getByRole("button", { name: "Save exercise", exact: true })
    .click();
  await page.getByRole("link", { name: "View exercise", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Local test quad extension" }),
  ).toBeVisible();
  const other = await verifiedAccount();
  const otherRead = await other.client
    .from("exercises")
    .select("id")
    .eq("id", id);
  expect(otherRead.error).toBeNull();
  expect(otherRead.data).toEqual([]);
  const session = await account.client
    .from("workout_sessions")
    .insert({ owner_id: account.userId, name: "Local synthetic history" })
    .select("id")
    .single();
  expect(session.error).toBeNull();
  const history = await account.client.from("workout_exercises").insert({
    owner_id: account.userId,
    workout_session_id: session.data?.id,
    position: 1,
    exercise_id: id,
    exercise_name_snapshot: "Local original name",
  });
  expect(history.error).toBeNull();
  await page.goto("/exercises");
  await page
    .getByText("Recently selected in your workouts", { exact: true })
    .click();
  await expect(page.locator(".recent-links")).toContainText(
    "Local test quad extension",
  );
  await page.goto(`/exercises/${id}`);
  await page
    .getByRole("button", { name: "Archive exercise", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Exercise archived." }),
  ).toContainText("Workout history is preserved");
  const snapshot = await account.client
    .from("workout_exercises")
    .select("exercise_name_snapshot")
    .eq("exercise_id", id)
    .single();
  expect(snapshot.data?.exercise_name_snapshot).toBe("Local original name");
  await expect(page).toHaveURL(/\/exercises\?message=archived$/);
  await expect(
    page.getByText("Recently selected in your workouts", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("searchbox").fill("Local test quad extension");
  await expect(
    page.getByRole("heading", { name: "No matching exercises" }),
  ).toBeVisible();
  const system = catalog.exercises.find(
    (e) => e.slug === "barbell_bench_press",
  );
  if (!system) throw new Error("Missing catalog fixture");
  const response = await page.goto(`/exercises/${system.id}/edit`);
  expect(response).not.toBeNull();
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});
