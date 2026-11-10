import { test, expect } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import { loginSelection } from "./selection-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };

test.setTimeout(120000);
test("confirmed exercise actions reuse Add Set and return to the same Home; footer remains stable", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  const ids = ["barbell_bench_press", "seated_cable_row"].map(
    (slug) => catalog.exercises.find((e) => e.slug === slug)!.id,
  );
  const started = await a.client.rpc("start_exercise_workout", {
    p_exercises: ids,
    p_request: crypto.randomUUID(),
  });
  expect(started.error).toBeNull();
  const id = started.data as string;
  const items = await a.client
    .from("workout_exercises")
    .select("id,exercise_id")
    .eq("workout_session_id", id)
    .order("position");
  expect(items.error).toBeNull();
  await loginSelection(page, a);
  await page.goto(`/workout/${id}`);
  await page.locator(".workout-home .workout-movement-card a").first().click();
  await expect(
    page.getByRole("region", { name: "Exercise Logger", exact: true }),
  ).toBeVisible();
  const actions = page.getByRole("region", {
    name: "Exercise complete actions",
  });
  const controls = page.getByRole("navigation", {
    name: "Workout controls",
    exact: true,
  });
  await expect(actions).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("exercise-incomplete.png"),
    animations: "disabled",
  });
  const timingBefore = (
    await a.client.rpc("workout_continuity", { p_session: id })
  ).data;
  const rows = page.locator(".logged-set");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    await row.getByRole("textbox", { name: /weight in pounds/ }).fill("100");
    await row.getByRole("textbox", { name: / reps$/ }).fill("8");
    await row.getByRole("checkbox", { name: / complete$/ }).check();
    await expect(row.getByRole("status")).toContainText("Saved");
    if (i < count - 1) await expect(actions).toHaveCount(0);
  }
  await expect(actions).toBeVisible();
  // A checked saved row with an unsaved edit or in-flight write is not ready.
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
  await rows
    .last()
    .getByRole("textbox", { name: / reps$/ })
    .fill("9");
  await expect(actions).toHaveCount(0);
  await rows
    .last()
    .getByRole("textbox", { name: / reps$/ })
    .press("Tab");
  await intercepted;
  await expect(actions).toHaveCount(0);
  release();
  await expect(rows.last().getByRole("status")).toContainText("Saved");
  await page.unroute("**/workout/**");
  await expect(actions).toBeVisible();
  await page.reload();
  await expect(actions).toBeVisible();
  await actions
    .getByRole("button", { name: "Add Set", exact: true })
    .dblclick();
  await expect(rows).toHaveCount(count + 1);
  await expect(actions).toHaveCount(0);
  const extra = rows.last();
  await expect(
    extra.getByRole("checkbox", { name: / complete$/ }),
  ).not.toBeChecked();
  await extra.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.screenshot({
    path: info.outputPath("add-set-pending.png"),
    animations: "disabled",
  });
  await expect(extra.getByRole("textbox", { name: / reps$/ })).toHaveValue("9");
  await expect(
    extra.getByRole("textbox", { name: /weight in pounds/ }),
  ).toHaveValue("100");
  await extra.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(extra.getByRole("status")).toContainText("Saved");
  await expect(actions).toBeVisible();
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      const back = controls.getByRole("link", {
        name: "Back to Workout Home",
        exact: true,
      });
      const abandon = controls.getByRole("button", {
        name: "Abandon",
        exact: true,
      });
      const finish = controls.getByRole("button", {
        name: "Finish",
        exact: true,
      });
      const before = await abandon.boundingBox();
      await abandon.click();
      const confirm = controls.getByRole("button", {
        name: "Confirm Abandon",
        exact: true,
      });
      expect(await confirm.boundingBox()).toEqual(before);
      const boxes = await Promise.all(
        [back, confirm, finish].map((el) => el.boundingBox()),
      );
      expect(
        Math.max(...boxes.map((b) => b!.width)) -
          Math.min(...boxes.map((b) => b!.width)),
      ).toBeLessThan(1);
      expect(new Set(boxes.map((b) => b!.y)).size).toBe(1);
      expect(boxes.every((b) => b!.height >= 48)).toBe(true);
      await expect(
        controls.getByRole("button", { name: /Cancel/ }),
      ).toHaveCount(0);
      const timer = await controls
        .getByRole("button", { name: /Workout Timer/ })
        .boundingBox();
      expect(timer!.y + timer!.height).toBeLessThanOrEqual(boxes[0]!.y);
      expect(timer!.width).toBeGreaterThan(boxes[0]!.width * 2.9);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`confirmed-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(abandon).toBeVisible();
    }
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await controls.getByRole("button", { name: "Abandon", exact: true }).click();
  const enlarged = controls.getByRole("button", {
    name: "Confirm Abandon",
    exact: true,
  });
  expect(
    await enlarged.evaluate(
      (el) =>
        el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("footer-200-percent.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    document.documentElement.style.removeProperty("font-size"),
  );
  // Emulate the visualViewport resize signal used by the existing keyboard handling.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, "height", {
      configurable: true,
      get: () => innerHeight - 280,
    });
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(controls).toHaveCSS("bottom", "280px");
  await expect(actions).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("keyboard-inset-simulated.png"),
    animations: "disabled",
  });
  await page.evaluate(() => {
    Reflect.deleteProperty(visualViewport!, "height");
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(controls).toHaveCSS("bottom", "0px");
  await controls.getByRole("button", { name: "Abandon", exact: true }).click();
  await actions
    .getByRole("button", { name: "Next Exercise", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/workout/${id}$`));
  await expect(
    page.getByRole("region", { name: "Workout Home", exact: true }),
  ).toBeVisible();
  await expect(
    controls.getByRole("button", { name: "Abandon", exact: true }),
  ).toBeVisible();
  expect(
    (
      await a.client
        .from("workout_exercises")
        .select("id,exercise_id")
        .eq("workout_session_id", id)
        .order("position")
    ).data,
  ).toEqual(items.data);
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("status,program_assignment_id")
        .eq("id", id)
        .single()
    ).data,
  ).toMatchObject({ status: "in_progress", program_assignment_id: null });
  const timingAfter = (
    await a.client.rpc("workout_continuity", { p_session: id })
  ).data;
  expect(timingAfter.started_at).toBe(timingBefore.started_at);
  expect(timingAfter.effective_elapsed_seconds).toBeGreaterThanOrEqual(
    timingBefore.effective_elapsed_seconds,
  );
  await page.screenshot({
    path: info.outputPath("same-workout-home.png"),
    animations: "disabled",
  });
});

test("mobile header stays opaque and readable while scrolling", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/exercises");
    const header = page.locator(".topbar");
    await expect(header.locator(".mobile-brand")).toBeVisible();
    await expect(header).toHaveCSS("position", "sticky");
    expect(
      await header.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).not.toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({
      path: info.outputPath(`header-top-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.evaluate(() => scrollTo(0, 500));
    expect((await header.boundingBox())!.y).toBe(0);
    await page.screenshot({
      path: info.outputPath(`header-scroll-${colorScheme}.png`),
      animations: "disabled",
    });
  }
});
