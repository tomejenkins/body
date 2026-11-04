import { expect, test, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(120000);
function id(slug: string) {
  const e = catalog.exercises.find((e) => e.slug === slug);
  if (!e) throw Error("Missing fixture");
  return e.id;
}
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
test("builder context, recent Add, detail Add, recommendations, Look Back and restored filters", async ({
  page,
}) => {
  const account = await verifiedAccount();
  const old = await account.client.rpc("start_ad_hoc_workout");
  for (const slug of ["barbell_bench_press", "pull_up"])
    expect(
      (
        await account.client.rpc("edit_workout", {
          p_session: old.data,
          p_operation: "add",
          p_exercise: id(slug),
        })
      ).error,
    ).toBeNull();
  await account.client.rpc("end_workout", {
    p_session: old.data,
    p_outcome: "completed",
  });
  const workout = await account.client.rpc("start_ad_hoc_workout");
  const builder = `/workout/${workout.data}/select`;
  await login(page, account);
  await page.goto(builder);
  await page.locator(".library-recents > summary").click();
  const recents = page.locator(".library-recents");
  await recents
    .getByRole("link", { name: "Barbell bench press", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/exercises/[a-f0-9-]+(?:/history)?\\?.*workoutId=${workout.data}`,
    ),
  );
  expect(new URL(page.url()).searchParams.get("workoutId")).toBe(workout.data);
  await expect(
    page.getByRole("button", { name: "Add to Workout", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "← Back to Workout Builder", exact: true })
    .click();
  await expect(recents).toHaveAttribute("open", "");
  await recents
    .getByRole("button", {
      name: "Add Barbell bench press to workout",
      exact: true,
    })
    .click();
  await expect(
    recents.getByRole("button", {
      name: "Already Added Barbell bench press",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Done · 1 selected", exact: true }),
  ).toBeVisible();
  await recents.getByRole("link", { name: "Pull-up", exact: true }).click();
  await page
    .getByRole("button", { name: "Add to Workout", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(builder + "\\?"));
  await expect(
    page.getByText("Exercise added to your workout.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Done · 2 selected", exact: true }),
  ).toBeVisible();
  await recents.getByRole("link", { name: "Pull-up", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Already Added", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "← Back to Workout Builder", exact: true })
    .click();
  await page.getByRole("searchbox").fill("press");
  await page.locator(".library-refine > summary").click();
  const movement = catalog.movementPatterns.find(
    (p) => p.slug === "horizontal_push",
  )?.id;
  if (!movement) throw Error("Missing movement");
  await page
    .getByLabel("Movement pattern", { exact: true })
    .selectOption(movement);
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("compound");
  await page.locator(".library-suggestions > summary").click();
  const recommendation = page.locator(".library-suggestions li").first();
  const link = recommendation.getByRole("link");
  const recommendedName = await link.innerText();
  const href = await link.getAttribute("href");
  if (!href) throw Error("Missing context URL");
  const recommendedId = new URL(href, "http://localhost").pathname
    .split("/")
    .at(-1);
  await link.click();
  await expect(
    page.getByRole("button", { name: "Add to Workout", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Look Back", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "← Back to Exercise Details", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(
      `/exercises/[a-f0-9-]+(?:/history)?\\?.*workoutId=${workout.data}`,
    ),
  );
  expect(new URL(page.url()).searchParams.get("workoutId")).toBe(workout.data);
  await page
    .getByRole("link", { name: "← Back to Exercise Details", exact: true })
    .click();
  await page
    .getByRole("link", { name: "← Back to Workout Builder", exact: true })
    .click();
  await expect(page.getByRole("searchbox")).toHaveValue("press");
  await expect(
    page.getByLabel("Movement pattern", { exact: true }),
  ).toHaveValue(movement);
  await expect(page.getByLabel("Exercise type", { exact: true })).toHaveValue(
    "compound",
  );
  await expect(page.locator(".library-suggestions")).toHaveAttribute(
    "open",
    "",
  );
  await page
    .locator(".library-suggestions")
    .getByRole("button", {
      name: `Add ${recommendedName} to workout`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", { name: "Done · 3 selected", exact: true }),
  ).toBeVisible();
  await page
    .locator(".exercise-grid")
    .getByRole("link", { name: "Barbell bench press", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Already Added", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "← Back to Workout Builder", exact: true })
    .click();
  await expect(page.getByRole("searchbox")).toHaveValue("press");
  const selected = await account.client
    .from("workout_exercises")
    .select("exercise_id")
    .eq("workout_session_id", workout.data)
    .is("removed_at", null);
  expect(selected.data).toHaveLength(3);
  expect(
    selected.data?.filter((e) => e.exercise_id === id("barbell_bench_press")),
  ).toHaveLength(1);
  expect(
    selected.data?.filter((e) => e.exercise_id === recommendedId),
  ).toHaveLength(1);
  await page.goto(`/exercises/${id("barbell_bench_press")}`);
  await expect(
    page.getByRole("link", { name: "← Exercise library", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to Workout", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Look Back", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "← History", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("invalid and foreign context expose no controls; stale closed workout additions fail safely", async ({
  page,
}) => {
  const account = await verifiedAccount(),
    other = await verifiedAccount();
  const foreign = await other.client.rpc("start_ad_hoc_workout");
  await login(page, account);
  const detail = `/exercises/${id("barbell_bench_press")}`;
  for (const context of ["bad", foreign.data]) {
    await page.goto(
      `${detail}?workoutId=${context}&builder=returnTo%3Dhttps%3A%2F%2Fevil.example`,
    );
    await expect(
      page.getByRole("button", { name: "Add to Workout", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "← Exercise library", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "← Back to Workout Builder",
        exact: true,
      }),
    ).toHaveCount(0);
  }
  for (const outcome of ["completed", "abandoned"]) {
    const w = await account.client.rpc("start_ad_hoc_workout");
    await page.goto(`${detail}?workoutId=${w.data}`);
    await expect(
      page.getByRole("button", { name: "Add to Workout", exact: true }),
    ).toBeVisible();
    expect(
      (
        await account.client.rpc("end_workout", {
          p_session: w.data,
          p_outcome: outcome,
        })
      ).error,
    ).toBeNull();
    await page
      .getByRole("button", { name: "Add to Workout", exact: true })
      .click();
    await expect(
      page.getByText(
        "This workout is closed. Exercises can no longer be added.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add to Workout", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "← Back to Workout", exact: true }),
    ).toHaveAttribute("href", `/workout/${w.data}`);
    const rows = await account.client
      .from("workout_exercises")
      .select("id")
      .eq("workout_session_id", w.data);
    expect(rows.data).toEqual([]);
  }
});
