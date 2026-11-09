import { test, expect, type Locator } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import {
  loginSelection,
  selectionProgram,
  completeSelection,
} from "./selection-helpers";
import { openWorkoutEnding } from "./workout-screen-helpers";
import { dateOffset } from "../../src/features/scheduling/model";
test.setTimeout(120000);
test.use({ actionTimeout: 10000 });
async function open(details: Locator) {
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
}
test("authoritative recommended and alternative choices keep source day, pending gap and repeat rotation", async ({
  page,
  browser,
}, info) => {
  const a = await verifiedAccount();
  const p = await selectionProgram(a);
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
  await expect(rec).toContainText("Training 1");
  await expect(rec.getByText("Recommended · Current Program")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const rect = await rec.boundingBox();
  expect(rect!.y + rect!.height).toBeLessThan(770);
  const alternatives = page.locator(".program-workout-options");
  await open(alternatives);
  await expect(alternatives.locator("li")).toHaveCount(3);
  await expect(alternatives).not.toContainText("Recovery");
  await alternatives
    .getByRole("button", { name: "Start Training 2", exact: true })
    .click();
  await expect(page).toHaveURL(/workout\/[a-f0-9-]{36}$/);
  const session = new URL(page.url()).pathname.split("/").pop()!;
  const row = (
    await a.client
      .from("workout_sessions")
      .select("source_program_day_id,source_rotation")
      .eq("id", session)
      .single()
  ).data!;
  expect(row.source_program_day_id).toBe(p.days[1].id);
  expect(row.source_rotation).toBe(0);
  await completeSelection(a, session, p.exercise, [12, 12]);
  await page.goto("/workout");
  await expect(rec).toContainText("Training 1");
  await open(alternatives);
  await expect(
    alternatives.locator("li").filter({ hasText: "Training 2" }),
  ).toContainText("Completed in this rotation");
  await alternatives
    .getByRole("button", { name: "Repeat Training 2", exact: true })
    .click();
  await expect(page).toHaveURL(/workout\/[a-f0-9-]{36}$/);
  const repeat = new URL(page.url()).pathname.split("/").pop()!;
  await completeSelection(a, repeat, p.exercise, [12, 12]);
  const options = (await a.client.rpc("workout_start_options")).data;
  expect(options.assignment.cursor.position).toBe(1);
  expect(options.assignment.cursor.completedRotations).toBe(0);
  const ctx = await browser.newContext();
  await ctx.addCookies(await page.context().cookies());
  const second = await ctx.newPage();
  await second.goto("/workout");
  await expect(
    second.getByRole("region", { name: "Recommended workout" }),
  ).toContainText("Training 1");
  await ctx.close();
  await page.goto("/workout");
  await open(alternatives);
  for (const width of [375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1024 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 1440)
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await rec.screenshot({
          path: info.outputPath(`recommended-${width}-${colorScheme}.png`),
          animations: "disabled",
        });
        await alternatives.screenshot({
          path: info.outputPath(`alternatives-${width}-${colorScheme}.png`),
          animations: "disabled",
        });
      }
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("partial acceptance, confirmed skip, defer replacement/cancel and stale device decisions update the calendar", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  const p = await selectionProgram(a, 8);
  await completeSelection(a, p.session, p.exercise, [12]);
  await loginSelection(page, a);
  await page.goto("/workout");
  const controls = page.locator(".schedule-decisions");
  await open(controls);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    controls.getByRole("button", { name: "Accept Partial & Continue" }),
  ).toBeVisible();
  await controls.screenshot({
    path: info.outputPath("partial-acceptance.png"),
  });
  await controls
    .getByLabel("Continue without inventing the missing work")
    .check();
  await controls
    .getByRole("button", { name: "Accept Partial & Continue" })
    .click();
  await expect(
    page.getByRole("region", { name: "Recommended workout" }),
  ).toContainText("Training 2");
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("completion_status")
        .eq("id", p.session)
        .single()
    ).data!.completion_status,
  ).toBe("partial");
  await open(controls);
  await open(
    controls
      .locator("details")
      .filter({ has: page.getByText("Skip this workout", { exact: true }) }),
  );
  await controls
    .getByLabel("Skip this occurrence without completing it")
    .check();
  await controls.getByRole("button", { name: "Confirm skip" }).click();
  await expect(
    page.getByRole("region", { name: "Recommended workout" }),
  ).toContainText("Training 3");
  const options = (await a.client.rpc("workout_start_options")).data;
  await open(controls);
  await open(
    controls.locator("details").filter({
      has: page.getByText("Postpone this workout", { exact: true }),
    }),
  );
  await controls
    .getByLabel("Future local date")
    .fill(dateOffset(options.assignment.today, 4));
  await controls.screenshot({ path: info.outputPath("defer-skip.png") });
  await controls
    .getByRole("button", { name: "Defer workout", exact: true })
    .click();
  await expect(
    controls.getByRole("button", { name: "Cancel deferral" }),
  ).toBeVisible();
  expect(
    (await a.client.rpc("workout_start_options")).data.assignment.cursor
      .deferredUntil,
  ).toBe(dateOffset(options.assignment.today, 4));
  await controls
    .getByLabel("Future local date")
    .fill(dateOffset(options.assignment.today, 3));
  await controls.getByRole("button", { name: "Replace deferral" }).click();
  await expect
    .poll(
      async () =>
        (await a.client.rpc("workout_start_options")).data.assignment.cursor
          .deferredUntil,
    )
    .toBe(dateOffset(options.assignment.today, 3));
  await controls.getByRole("button", { name: "Cancel deferral" }).click();
  await expect
    .poll(
      async () =>
        (await a.client.rpc("workout_start_options")).data.assignment.cursor
          .deferredUntil,
    )
    .toBeNull();
  await page.goto("/programs");
  const calendar = page.getByRole("region", { name: "Program calendar" });
  await expect(calendar.getByText("Skipped", { exact: true })).toBeVisible();
  await expect(
    calendar.getByText("Partial accepted · scheduling only", { exact: true }),
  ).toBeVisible();
  await calendar.screenshot({
    path: info.outputPath("decisions-calendar.png"),
  });
  await page.goto("/workout");
  await open(controls);
  await open(
    controls
      .locator("details")
      .filter({ has: page.getByText("Skip this workout", { exact: true }) }),
  );
  const current = (await a.client.rpc("workout_start_options")).data.assignment;
  const c = current.cursor;
  const results = await Promise.all(
    [1, 2].map(() =>
      a.client.rpc("decide_program_schedule", {
        p_assignment: current.id,
        p_version: current.version,
        p_day: c.dayId,
        p_rotation: c.rotation,
        p_expected: c.workIndex,
        p_revision: c.decisionRevision,
        p_kind: "skip",
        p_request: crypto.randomUUID(),
      }),
    ),
  );
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(results.filter((r) => r.error?.code === "40001")).toHaveLength(1);
  await controls
    .getByLabel("Skip this occurrence without completing it")
    .check();
  await controls.getByRole("button", { name: "Confirm skip" }).click();
  await expect(controls.getByRole("alert")).toContainText("changed");
  expect(
    (await a.client.rpc("workout_start_options")).data.assignment.cursor
      .position,
  ).toBe(7);
});
test("program and completed ad-hoc favorites launch independently with clean logging and safe rename/remove", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  const p = await selectionProgram(a, 3);
  await a.client.rpc("end_workout", {
    p_session: p.session,
    p_outcome: "abandoned",
  });
  await loginSelection(page, a);
  await page.goto("/workout");
  const alternatives = page.locator(".program-workout-options");
  await open(alternatives);
  const day = alternatives.locator("li").filter({ hasText: "Training 2" });
  await open(day.locator(".save-favorite"));
  await day.getByLabel("Favorite name").fill("Saved press");
  await day.getByRole("button", { name: "Save Favorite", exact: true }).click();
  const favorites = page.getByRole("region", { name: "Your Favorites" });
  await expect(
    favorites.getByRole("button", { name: "Start Saved press" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await favorites.screenshot({ path: info.outputPath("favorites.png") });
  const before = (await a.client.rpc("workout_start_options")).data;
  const favorite = before.favorites[0];
  const requests = await Promise.all(
    [1, 2].map(() =>
      a.client.rpc("start_favorite_workout", {
        p_favorite: favorite.id,
        p_request: crypto.randomUUID(),
      }),
    ),
  );
  expect(requests.filter((r) => !r.error)).toHaveLength(1);
  const session = requests.find((r) => !r.error)!.data as string;
  const source = (
    await a.client
      .from("workout_sessions")
      .select("program_assignment_id,source_rotation,source_program_version_id")
      .eq("id", session)
      .single()
  ).data!;
  expect(source).toEqual({
    program_assignment_id: null,
    source_rotation: null,
    source_program_version_id: null,
  });
  expect(
    (await a.client.rpc("workout_start_options")).data.assignment.cursor,
  ).toEqual(before.assignment.cursor);
  await page.goto(`/workout/${session}`);
  await page.locator(".movement-row-toggle").first().click();
  await expect(page.locator(".movement-carousel")).toContainText(
    "Favorite default",
  );
  await expect(page.locator(".movement-carousel")).not.toContainText(
    "Program Recommended",
  );
  await page.locator(".movement-carousel button").first().click();
  const set = page.locator(".logged-set").first();
  await expect(
    set.getByRole("checkbox", { name: / complete$/ }),
  ).not.toBeChecked();
  await set.getByRole("textbox", { name: /weight in pounds/ }).fill("100");
  await set.getByRole("textbox", { name: / reps$/ }).fill("8");
  await set.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(set.getByRole("status")).toContainText("Saved");
  await openWorkoutEnding(page);
  const acknowledge = page.getByRole("checkbox", {
    name: /Finish without completing/,
  });
  if (await acknowledge.count()) await acknowledge.check();
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/message=completed/);
  await page.goto(`/history/${session}`);
  await expect(page.getByText(/Independent Favorite/)).toBeVisible();
  await open(page.locator(".save-favorite"));
  await page.getByLabel("Favorite name").fill("Modified press");
  await page
    .getByRole("button", { name: "Save Favorite", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to Your Favorites" }),
  ).toBeVisible();
  const after = (await a.client.rpc("workout_start_options")).data;
  expect(after.assignment.cursor).toEqual(before.assignment.cursor);
  expect(after.favorites).toHaveLength(2);
  expect(
    after.favorites.find((f: { name: string }) => f.name === "Modified press")
      .sourceType,
  ).toBe("completed_ad_hoc");
  await page.goto("/workout");
  await open(
    favorites.getByText("Manage Saved press", { exact: true }).locator(".."),
  );
  const original = favorites.locator("li").filter({
    has: page.getByRole("heading", { name: "Saved press", exact: true }),
  });
  await original.getByLabel("New name").fill("Renamed press");
  await original.getByRole("button", { name: "Rename Favorite" }).click();
  await expect(
    favorites.getByRole("heading", { name: "Renamed press" }),
  ).toBeVisible();
  const renamed = favorites.locator("li").filter({
    has: page.getByRole("heading", { name: "Renamed press", exact: true }),
  });
  await open(renamed.locator("details"));
  await renamed
    .getByLabel("Remove this shortcut; keep existing history")
    .check();
  await renamed.getByRole("button", { name: "Remove Favorite" }).click();
  await expect(
    favorites.getByRole("heading", { name: "Renamed press" }),
  ).toHaveCount(0);
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("name,status")
        .eq("id", session)
        .single()
    ).data,
  ).toEqual({ name: "Saved press", status: "completed" });
});
test("closed-session feedback uses current 3 × 12 evidence while 12/10/9 holds and active evidence stays prior-only", async ({
  page,
}) => {
  const a = await verifiedAccount();
  const p = await selectionProgram(a, 3, 3, true);
  const item = await completeSelection(a, p.session, p.exercise, [12, 12, 12]);
  await loginSelection(page, a);
  await page.goto(`/history/${p.session}`);
  await expect(page.getByRole("region", { name: "Next time" })).toContainText(
    "Consider a small load increase",
  );
  const evidence = (
    await a.client.rpc("program_progression_evidence", { p_session: p.session })
  ).data;
  expect(
    evidence
      .find((e: { itemId: string }) => e.itemId === item)
      .history.filter((h: { sessionId: string }) => h.sessionId === p.session),
  ).toHaveLength(3);
  const next = await a.client.rpc("start_program_workout", {
    p_version: p.version,
    p_workout: 1,
    p_request: crypto.randomUUID(),
  });
  expect(next.error).toBeNull();
  const m = (
    await a.client
      .from("workout_movements")
      .select("id")
      .eq("workout_session_id", next.data)
      .single()
  ).data!;
  await a.client.rpc("select_program_exercise", {
    p_movement: m.id,
    p_exercise: p.exercise,
    p_expected: null,
    p_request: crypto.randomUUID(),
  });
  const live = (
    await a.client.rpc("program_progression_evidence", { p_session: next.data })
  ).data;
  expect(
    live[0].history.some(
      (h: { sessionId: string }) => h.sessionId === next.data,
    ),
  ).toBe(false);
  await completeSelection(a, next.data as string, p.exercise, [12, 10, 9]);
  await page.goto(`/history/${next.data}`);
  await expect(page.getByRole("region", { name: "Next time" })).toContainText(
    "Build every prescribed set to the top",
  );
});
