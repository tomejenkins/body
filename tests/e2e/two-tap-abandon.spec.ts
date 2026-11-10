import { test, expect } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import { loginSelection, selectionProgram } from "./selection-helpers";
test.setTimeout(120000);
test.use({ actionTimeout: 12000 });
test("inline two-tap abandonment preserves saved work, supports cancellation/retry and never advances or ends a program", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 8, 2);
  const schedule = await a.client.rpc("program_schedule"),
    id = schedule.data.assignmentId;
  expect(
    (
      await a.client.rpc("program_lifecycle", {
        p_kind: "end_after_next",
        p_request: crypto.randomUUID(),
        p_assignment: id,
        p_expected: 0,
      })
    ).error,
  ).toBeNull();
  const movement = await a.client
    .from("workout_movements")
    .select("id")
    .eq("workout_session_id", p.session)
    .single();
  const e = await a.client.rpc("select_program_exercise", {
    p_movement: movement.data!.id,
    p_exercise: p.exercise,
    p_expected: null,
    p_request: crypto.randomUUID(),
  });
  expect(e.error).toBeNull();
  const row = await a.client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", e.data)
    .order("position")
    .limit(1)
    .single();
  expect(
    (
      await a.client.rpc("log_workout_set", {
        p_item: e.data,
        p_id: row.data!.id,
        p_revision: row.data!.revision,
        p_operation: "save",
        p_mutation: crypto.randomUUID(),
        p_reps: 5,
        p_weight: 100,
        p_completed: true,
      })
    ).error,
  ).toBeNull();
  await loginSelection(page, a);
  await page.goto(`/workout/${p.session}`);
  const controls = page.getByRole("navigation", {
    name: "Workout controls",
    exact: true,
  });
  await expect(controls).toHaveCSS("position", "fixed");
  let abandonPosts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.postData()?.includes("abandoned"))
      abandonPosts++;
  });
  await expect(
    controls.getByRole("button", { name: "Finish Workout", exact: true }),
  ).toBeVisible();
  await expect(
    controls.getByRole("button", { name: "Abandon", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("finish-abandon-default.png"),
    animations: "disabled",
  });
  await controls.getByRole("button", { name: "Abandon", exact: true }).click();
  expect(abandonPosts).toBe(0);
  await expect(
    controls.getByRole("button", { name: "Confirm Abandon", exact: true }),
  ).toHaveClass(/bg-destructive/);
  for (const width of [375, 390, 430])
    for (const colorScheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await expect(controls).toHaveCSS("position", "fixed");
      const finish = await controls
          .getByRole("button", { name: "Finish Workout", exact: true })
          .boundingBox(),
        confirm = await controls
          .getByRole("button", { name: "Confirm Abandon", exact: true })
          .boundingBox();
      expect(finish!.height).toBeGreaterThanOrEqual(44);
      expect(confirm!.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(finish!.y - confirm!.y)).toBeLessThan(5);
      expect(confirm!.x).toBeGreaterThanOrEqual(finish!.x + finish!.width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`confirm-abandon-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
    }
  await controls
    .getByRole("button", { name: "Cancel abandonment", exact: true })
    .click();
  expect(abandonPosts).toBe(0);
  await expect(
    controls.getByRole("button", { name: "Abandon", exact: true }),
  ).toBeVisible();
  await controls.getByRole("button", { name: "Abandon", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(
    controls.getByRole("button", { name: "Confirm Abandon", exact: true }),
  ).toBeFocused();
  await controls
    .getByRole("button", { name: "Finish Workout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keep training", exact: true })
    .click();
  await expect(
    controls.getByRole("button", { name: "Abandon", exact: true }),
  ).toBeVisible();
  await controls.getByRole("button", { name: "Abandon", exact: true }).click();
  await page.reload();
  await expect(
    controls.getByRole("button", { name: "Abandon", exact: true }),
  ).toBeVisible();
  expect(abandonPosts).toBe(0);
  // A failed transport never implies authoritative closure.
  let fail = true;
  await page.route("**/workout/**", async (route) => {
    if (
      fail &&
      route.request().method() === "POST" &&
      route.request().postData()?.includes("abandoned")
    ) {
      fail = false;
      await route.abort("failed");
    } else await route.continue();
  });
  await controls.getByRole("button", { name: "Abandon", exact: true }).click();
  await controls
    .getByRole("button", { name: "Confirm Abandon", exact: true })
    .click();
  await expect(controls.getByRole("alert")).toContainText(
    "could not be closed",
  );
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("status")
        .eq("id", p.session)
        .single()
    ).data!.status,
  ).toBe("in_progress");
  await page.unroute("**/workout/**");
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let intercepted = false;
  await page.route("**/workout/**", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postData()?.includes("abandoned")
    ) {
      intercepted = true;
      await gate;
    }
    await route.continue();
  });
  await controls
    .getByRole("button", { name: "Confirm Abandon", exact: true })
    .click();
  await expect.poll(() => intercepted).toBe(true);
  await expect(
    controls.getByRole("button", { name: "Finish Workout", exact: true }),
  ).toBeDisabled();
  await expect(
    controls.getByRole("button", { name: "Closing workout…", exact: true }),
  ).toBeDisabled();
  release();
  await expect(page).toHaveURL(
    new RegExp(`/workout\\?message=abandoned&finished=${p.session}$`),
  );
  await expect(
    page.getByRole("complementary", { name: "Active workout", exact: true }),
  ).toHaveCount(0);
  expect(page.url()).not.toContain("/complete");
  const state = await a.client.rpc("program_schedule");
  expect(state.data.progress.workIndex).toBe(schedule.data.progress.workIndex);
  expect(
    (
      await a.client
        .from("program_assignments")
        .select("state,pending_end_request_id")
        .eq("id", id)
        .single()
    ).data,
  ).toMatchObject({ state: "active" });
  expect(
    (
      await a.client
        .from("program_assignments")
        .select("pending_end_request_id")
        .eq("id", id)
        .single()
    ).data!.pending_end_request_id,
  ).toBeTruthy();
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("actual_weight_kg,status")
        .eq("id", row.data!.id)
        .single()
    ).data,
  ).toMatchObject({ actual_weight_kg: 100, status: "completed" });
  expect(
    (await a.client.rpc("record_metrics", { p_exercise: p.exercise })).data,
  ).toEqual([]);
  expect(abandonPosts).toBe(2);
});
