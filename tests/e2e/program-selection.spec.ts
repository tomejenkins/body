import { enrollFromDetail } from "./enrollment-helpers";
import { displayWeight } from "../../src/features/sets/model";
import { test, expect, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import programs from "../../supabase/catalog/programs.json" with { type: "json" };
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
const exercise = (slug: string) =>
  catalog.exercises.find((e) => e.slug === slug)!;
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
async function start(page: Page) {
  const p = programs.find((p) => p.slug === "upper-lower-strength-size")!;
  await page.goto(`/programs/${p.id}`);
  await enrollFromDetail(page, `/programs/${p.id}`);
  await page
    .getByRole("button", { name: "Start Workout 1", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[0-9a-f-]+$/);
  await page
    .locator(".workout-items > li")
    .first()
    .getByRole("button", { name: /^Choose exercise/, exact: true })
    .click();
  return new URL(page.url()).pathname.split("/").pop()!;
}
const firstMovement = (page: Page) =>
  page.locator(".workout-items > li").first();
const carousel = (page: Page) =>
  page.getByRole("group", {
    name: "Exercises for Movement 1",
    exact: true,
  });
async function saved(page: Page) {
  await expect(
    firstMovement(page).locator(".set-save-state").first(),
  ).toHaveText(/^Saved/);
}
test("direct logger, four match levels, touch carousel, persistence and explicit safe continuation", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await login(page, a);
  const session = await start(page);
  await expect(page.locator(".workout-items > li")).toHaveCount(5);
  await expect(page.locator(".logged-set")).toHaveCount(0);
  await expect(page.getByText(/cycle position/i)).toHaveCount(0);
  const tiles = carousel(page).getByRole("button");
  await expect(tiles.first()).toContainText("Program Recommended");
  await expect(tiles.first()).toHaveAttribute(
    "data-exercise-id",
    exercise("barbell_bench_press").id,
  );
  const ids = await tiles.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-exercise-id")),
  );
  expect(new Set(ids).size).toBe(ids.length);
  for (const name of ["Close"])
    await expect(
      carousel(page)
        .locator(".movement-match")
        .filter({ hasText: new RegExp(`^${name}$`) })
        .first(),
    ).toBeVisible();
  await expect(tiles.first().locator(".movement-match")).toHaveCount(0);
  if (info.project.name === "mobile") {
    const widths = await carousel(page).evaluate((el) => {
      const tile = el.querySelector("button")!;
      return {
        viewport: el.clientWidth,
        tile: tile.getBoundingClientRect().width,
      };
    });
    expect(widths.viewport / widths.tile).toBeGreaterThanOrEqual(2.5);
    expect(widths.viewport / widths.tile).toBeLessThanOrEqual(3.1);
    const list = page.locator(".movement-carousel");
    await list.scrollIntoViewIfNeeded();
    const box = await list.boundingBox();
    if (!box) throw Error("Carousel missing");
    const touch = await page.context().newCDPSession(page);
    const y = box.y + box.height / 2;
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width * 0.8, y }],
    });
    for (let i = 1; i <= 6; i++)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: box.x + box.width * (0.8 - i * 0.1), y }],
      });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => list.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    await touch.detach();
  }
  await carousel(page).getByRole("button").first().click();
  await expect(firstMovement(page).locator(".logged-set")).toHaveCount(3);
  await page.locator(".movement-all summary").click();
  const angleSearch = page.getByRole("form", {
    name: "Search exercises for Movement 1",
  });
  await angleSearch.getByRole("searchbox").fill("incline dumbbell press");
  await angleSearch
    .getByRole("button", { name: "Search", exact: true })
    .click();
  const incline = page.locator(
    `.movement-search-results [data-exercise-id="${exercise("incline_dumbbell_press").id}"]`,
  );
  await expect(incline.locator(".movement-match")).toHaveText("Similar");
  await incline.click();
  await expect(
    carousel(page).locator('[aria-pressed="true"] .movement-match'),
  ).toHaveText("Similar");
  await carousel(page)
    .locator(`[data-exercise-id="${exercise("dumbbell_bench_press").id}"]`)
    .click();
  await expect(firstMovement(page).locator(".logged-set")).toHaveCount(3);
  await expect(firstMovement(page)).toContainText("Target 5–7 reps");
  await expect(firstMovement(page)).toContainText("Target RIR 2");
  await expect(carousel(page).locator('[aria-pressed="true"]')).toHaveAttribute(
    "data-exercise-id",
    exercise("dumbbell_bench_press").id,
  );
  await page.reload();
  await expect(firstMovement(page).locator(".logged-set")).toHaveCount(3);
  await expect(carousel(page).locator('[aria-pressed="true"]')).toHaveAttribute(
    "data-exercise-id",
    exercise("dumbbell_bench_press").id,
  );
  const row = firstMovement(page).locator(".logged-set").first();
  await row.getByRole("textbox", { name: /weight in pounds/ }).fill("100");
  await row.getByRole("textbox", { name: /reps/ }).fill("7");
  await row.getByRole("checkbox", { name: / complete$/ }).check();
  await saved(page);
  const before = await a.client
    .from("workout_sets")
    .select("id,actual_weight_kg,actual_reps,workout_exercise_id")
    .eq("status", "completed");
  expect(before.data).toHaveLength(1);
  await page
    .locator("summary")
    .filter({ hasText: "See All Exercises" })
    .click();
  const search = page.getByRole("form", {
    name: "Search exercises for Movement 1",
  });
  await search.getByRole("searchbox").fill("standing cable chest fly");
  await search.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".movement-search-results button")).toHaveCount(1);
  await expect(
    page.locator(".movement-search-results .movement-match"),
  ).toHaveText("Same Muscle");
  await page.locator(".movement-search-results button").click();
  await expect(
    page.getByRole("group", {
      name: "Confirm exercise continuation",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Keep sets and continue", exact: true })
    .click();
  await expect(page.locator(".workout-items > li")).toHaveCount(1);
  const current = page.locator(".workout-items > li").last();
  await expect(current.locator(".logged-set")).toHaveCount(2);
  await expect(
    current
      .locator(".logged-set")
      .first()
      .getByRole("textbox", { name: /weight/ }),
  ).toHaveValue("");
  const after = await a.client
    .from("workout_sets")
    .select("id,actual_weight_kg,actual_reps,workout_exercise_id")
    .eq("id", before.data![0].id);
  expect(after.data![0]).toEqual(before.data![0]);
  const original = await a.client
    .from("workout_exercises")
    .select("exercise_id")
    .eq("id", before.data![0].workout_exercise_id)
    .single();
  expect(original.data?.exercise_id).toBe(exercise("dumbbell_bench_press").id);
  const selection = await a.client
    .from("workout_exercises")
    .select("exercise_id,program_movement_id")
    .eq("workout_session_id", session)
    .is("removed_at", null)
    .order("position");
  expect(selection.data?.at(-1)?.exercise_id).toBe(
    exercise("standing_cable_chest_fly").id,
  );
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".movement-selection").screenshot({
      path: info.outputPath(`selection-${colorScheme}.png`),
      animations: "disabled",
      caret: "initial",
    });
  }
});
test("only completed actual performance updates exact-slot last choice; pick/last deduplicate and another client sees the selection", async ({
  page,
  browser,
}) => {
  const a = await verifiedAccount();
  await login(page, a);
  const first = await start(page);
  const m = await a.client
    .from("workout_movements")
    .select("id")
    .eq("workout_session_id", first)
    .order("position");
  const chosen = exercise("dumbbell_bench_press").id;
  const select = await a.client.rpc("select_program_exercise", {
    p_movement: m.data![0].id,
    p_exercise: chosen,
    p_expected: null,
    p_request: crypto.randomUUID(),
  });
  expect(select.error).toBeNull();
  const sets = await a.client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", select.data)
    .order("position");
  expect(
    (
      await a.client.rpc("log_workout_set", {
        p_item: select.data,
        p_id: sets.data![0].id,
        p_operation: "save",
        p_revision: sets.data![0].revision,
        p_mutation: crypto.randomUUID(),
        p_reps: 6,
        p_weight: 40,
        p_completed: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: first,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  const second = await start(page);
  const tiles = carousel(page).getByRole("button");
  await expect(tiles.nth(0)).toContainText("Program Recommended");
  await expect(tiles.nth(1)).toContainText("Last Used");
  await expect(tiles.nth(1)).toHaveClass(/last-used/);
  await page.locator(".movement-selection").screenshot({
    path: test.info().outputPath("last-used.png"),
    animations: "disabled",
  });
  await expect(tiles.nth(1)).toHaveAttribute("data-exercise-id", chosen);
  await tiles.nth(1).click();
  await expect(
    firstMovement(page)
      .locator(".logged-set")
      .first()
      .getByRole("textbox", { name: /weight in pounds/ }),
  ).toHaveValue(displayWeight(40, "lb"));
  const other = await browser.newContext();
  await other.addCookies(await page.context().cookies());
  const secondPage = await other.newPage();
  await secondPage.goto(`/workout/${second}`);
  await secondPage
    .locator(".workout-items > li")
    .first()
    .getByRole("button", { name: /^Choose or change exercise/, exact: true })
    .click();
  await expect(
    carousel(secondPage).locator('[aria-pressed="true"]'),
  ).toHaveAttribute("data-exercise-id", chosen);
  await other.close();
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: second,
        p_outcome: "abandoned",
      })
    ).error,
  ).toBeNull();
  const third = await start(page);
  await expect(carousel(page).getByRole("button").nth(1)).toContainText(
    "Last Used",
  );
  const thirdMovement = await a.client
    .from("workout_movements")
    .select("id")
    .eq("workout_session_id", third)
    .order("position");
  const pick = await a.client.rpc("select_program_exercise", {
    p_movement: thirdMovement.data![0].id,
    p_exercise: exercise("barbell_bench_press").id,
    p_expected: null,
    p_request: crypto.randomUUID(),
  });
  expect(pick.error).toBeNull();
  const pickSets = await a.client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", pick.data)
    .order("position");
  expect(
    (
      await a.client.rpc("log_workout_set", {
        p_item: pick.data,
        p_id: pickSets.data![0].id,
        p_operation: "save",
        p_revision: pickSets.data![0].revision,
        p_mutation: crypto.randomUUID(),
        p_reps: 6,
        p_weight: 70,
        p_completed: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: third,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  await start(page);
  await expect(carousel(page).getByRole("button").first()).toContainText(
    "Program Recommended · Last Used",
  );
  expect(
    new Set(
      await carousel(page)
        .getByRole("button")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-exercise-id")),
        ),
    ).size,
  ).toBe(await carousel(page).getByRole("button").count());
});

test("an offline draft remains reviewable if another client replaces its untouched server selection", async ({
  page,
}) => {
  const a = await verifiedAccount();
  await login(page, a);
  const session = await start(page);
  await carousel(page)
    .locator(`[data-exercise-id="${exercise("dumbbell_bench_press").id}"]`)
    .click();
  await expect(firstMovement(page).locator(".logged-set")).toHaveCount(3);
  const rows = await a.client
    .from("workout_exercises")
    .select("id,program_movement_id")
    .eq("workout_session_id", session)
    .is("removed_at", null);
  const original = rows.data![0];
  await page.route("**/*", (route) =>
    route.request().method() === "POST" &&
    route.request().headers()["next-action"]
      ? route.abort()
      : route.continue(),
  );
  const draft = firstMovement(page).locator(".logged-set").first();
  await draft.getByRole("textbox", { name: /weight in pounds/ }).fill("55");
  await draft.getByRole("textbox", { name: /weight in pounds/ }).press("Tab");
  await expect(draft.locator(".set-save-state")).toContainText("Not saved");
  const replacement = await a.client.rpc("select_program_exercise", {
    p_movement: original.program_movement_id,
    p_exercise: exercise("standing_cable_chest_fly").id,
    p_expected: original.id,
    p_request: crypto.randomUUID(),
  });
  expect(replacement.error).toBeNull();
  await page.unroute("**/*");
  page.once("dialog", (d) => d.accept());
  await page.reload();
  const recovery = page.getByRole("region", {
    name: "Drafts for replaced selections",
  });
  await expect(recovery).toContainText("Dumbbell bench press");
  await expect(recovery).toContainText("55 lb");
  await expect(recovery).toContainText("not recorded performance");
  await page
    .getByRole("link", { name: "Open exercise logger", exact: true })
    .first()
    .click();
  await expect(
    firstMovement(page)
      .locator(".logged-set")
      .first()
      .getByRole("textbox", { name: /weight in pounds/ }),
  ).toHaveValue("");
  await recovery
    .getByRole("button", { name: "Clear this unapplied draft" })
    .click();
  await expect(recovery).toHaveCount(0);
});
