import { openSetSettings } from "./set-options-helpers";
import { openMoreEffort } from "./set-options-helpers";
import { test, expect, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(90000);
test.use({ actionTimeout: 10000 });
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
async function program(a: Awaited<ReturnType<typeof verifiedAccount>>) {
  const p = await a.client
    .from("programs")
    .select("published_version_id")
    .eq("slug", "upper-lower-strength-size")
    .single();
  expect(p.error).toBeNull();
  await a.client
    .from("account_preferences")
    .update({ scheduling_timezone: "UTC" })
    .eq("owner_id", a.userId);
  const w = await a.client.rpc("start_program_workout", {
    p_version: p.data!.published_version_id,
    p_workout: 1,
    p_request: crypto.randomUUID(),
  });
  expect(w.error).toBeNull();
  return w.data as string;
}
const cards = (page: Page) =>
  page.locator(".workout-home .workout-movement-card");
const bar = (page: Page) =>
  page.getByRole("navigation", { name: "Workout controls", exact: true });
test("focused Home fits five rows, replaces global tabs, preserves management and end confirmation", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  const id = await program(a);
  await login(page, a);
  await page.goto(`/workout/${id}`);
  await expect(cards(page)).toHaveCount(5);
  await expect(
    page.getByRole("navigation", { name: "Main navigation", exact: true }),
  ).toBeHidden();
  expect(await page.locator(".workout-home").innerText()).not.toMatch(
    /Movement\s+\d/,
  );
  await expect(
    cards(page).locator(".suggested-controls, img, .set-source"),
  ).toHaveCount(0);
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(bar(page)).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390) {
      const last = await cards(page).last().boundingBox(),
        controls = await bar(page).boundingBox();
      expect(last!.y + last!.height).toBeLessThan(controls!.y);
      // Five movement rows still fit above the fixed controls. Direct Home
      // actions may extend the page; they replace the old one-line disclosure.
    }
    if (width === 390 || width === 375)
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.screenshot({
          path: info.outputPath(`home-${width}-${colorScheme}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
  }
  await cards(page).first().locator(".movement-row-toggle").click();
  await expect(page.locator(".movement-carousel")).toHaveCount(1);
  await expect(page.locator(".movement-context-heading").first()).toHaveText(
    "Program Recommended",
  );
  await cards(page).nth(1).locator(".movement-row-toggle").click();
  await expect(page.locator(".movement-carousel")).toHaveCount(1);
  await cards(page).nth(1).locator(".movement-row-toggle").click();
  await expect(page.locator(".workout-quick-actions")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add exercises", exact: true }),
  ).toBeVisible();
  await bar(page).getByRole("button", { name: "Finish", exact: true }).click();
  const ending = page.getByRole("dialog", { name: "End workout?" });
  await expect(ending).toBeVisible();
  await expect(
    ending.getByRole("button", { name: "Finish workout", exact: true }),
  ).toBeDisabled();
  await ending.getByRole("button", { name: "Keep training" }).click();
  const extra = await a.client
    .from("exercises")
    .select("id")
    .eq("slug", "barbell_back_squat")
    .single();
  expect(extra.error).toBeNull();
  const added = await a.client.rpc("edit_workout", {
    p_session: id,
    p_operation: "add",
    p_exercise: extra.data!.id,
  });
  expect(added.error).toBeNull();
  await page.reload();
  await expect(cards(page)).toHaveCount(6);
  await page.setViewportSize({ width: 375, height: 568 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollHeight > innerHeight),
    )
    .toBe(true);
  await expect(cards(page)).toHaveCount(6);
  await cards(page)
    .last()
    .evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(bar(page)).toBeInViewport();
  const sixth = await cards(page).last().boundingBox(),
    fixed = await bar(page).boundingBox();
  expect(sixth!.y + sixth!.height).toBeLessThanOrEqual(fixed!.y);
  await bar(page).getByRole("link", { name: "Back to app" }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Resume Workout", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/workout/${id}$`));
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("status")
        .eq("id", id)
        .single()
    ).data!.status,
  ).toBe("in_progress");
});
test("server timer pauses across refresh/devices, rejects races, and saved logging resumes without losing data", async ({
  page,
  browser,
}, info) => {
  const a = await verifiedAccount();
  const id = await program(a);
  await login(page, a);
  await page.goto(`/workout/${id}`);
  await bar(page)
    .getByRole("button", { name: /Workout Timer/ })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Workout Timer",
    exact: true,
  });
  await expect(panel).toBeVisible();
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("manual_paused_at")
        .eq("id", id)
        .single()
    ).data!.manual_paused_at,
  ).toBeNull();
  await panel
    .getByRole("button", { name: "Pause Workout", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText("Paused");
  await page.screenshot({
    path: info.outputPath("paused-timer.png"),
    fullPage: true,
    animations: "disabled",
  });
  const paused = await a.client.rpc("workout_continuity", { p_session: id });
  expect(paused.data.manual_paused_at).toBeTruthy();
  await page.reload();
  await expect(
    bar(page).getByRole("button", { name: /Workout Timer · Paused/ }),
  ).toBeVisible();
  const other = await browser.newContext();
  await other.addCookies(await page.context().cookies());
  const second = await other.newPage();
  await second.goto(`/workout/${id}`);
  await expect(
    second.getByRole("button", { name: /Workout Timer · Paused/ }),
  ).toBeVisible();
  const outcomes = await Promise.all(
    [1, 2].map(() =>
      a.client.rpc("set_workout_pause", {
        p_session: id,
        p_paused: false,
        p_revision: paused.data.timer_revision,
        p_request: crypto.randomUUID(),
      }),
    ),
  );
  expect(outcomes.filter((r) => r.error?.code === "40001")).toHaveLength(1);
  expect(outcomes.filter((r) => !r.error)).toHaveLength(1);
  await second.reload();
  await expect(
    second.getByRole("button", { name: /Workout Timer · Running/ }),
  ).toBeVisible();
  await other.close();
  await page.reload();
  await cards(page).first().locator(".movement-row-toggle").click();
  await page.locator(".movement-carousel button").first().click();
  await expect(
    page.getByRole("region", { name: "Exercise Logger", exact: true }),
  ).toBeVisible();
  await expect(bar(page)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await bar(page)
    .getByRole("button", { name: /Workout Timer/ })
    .click();
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: "Pause Workout", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText("Paused");
  await panel.getByRole("button", { name: "Dismiss timer" }).click();
  const row = page.locator(".logged-set").first();
  await row.getByRole("textbox", { name: /weight in pounds/ }).fill("100");
  await row.getByRole("textbox", { name: / reps$/ }).fill("8");
  await row.getByRole("checkbox", { name: / complete$/ }).click();
  await expect(row.getByRole("status")).toContainText("Saved");
  await expect
    .poll(
      async () =>
        (await a.client.rpc("workout_continuity", { p_session: id })).data
          .manual_paused_at,
    )
    .toBeNull();
  await page.reload();
  await expect(
    row.getByRole("textbox", { name: /weight in pounds/ }),
  ).toHaveValue("100");
  await openSetSettings(row);
  await expect(row.getByRole("checkbox", { name: /To Failure/ })).toHaveCount(
    0,
  );
  await openMoreEffort(row);
  await expect(row.getByRole("checkbox", { name: /To Failure/ })).toBeVisible();
  await openSetSettings(row);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.screenshot({
      path: info.outputPath(`logger-${colorScheme}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await expect(
    bar(page).getByRole("link", { name: "Back to Workout Home" }),
  ).toHaveCount(1);
  await bar(page).getByRole("link", { name: "Back to Workout Home" }).click();
  await expect(cards(page)).toHaveCount(5);
  await bar(page).getByRole("button", { name: "Finish", exact: true }).click();
  const ending = page.getByRole("dialog", { name: "End workout?" });
  await ending
    .getByRole("checkbox", { name: /Finish without completing/ })
    .check();
  await ending
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/complete$/);
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("status,completion_status")
        .eq("id", id)
        .single()
    ).data,
  ).toMatchObject({ status: "completed", completion_status: "partial" });
});
test("blank and generated ad-hoc management stays available without fabricated tile context", async ({
  page,
}) => {
  const a = await verifiedAccount();
  await login(page, a);
  await page.goto("/workout/new");
  await page.getByRole("radio", { name: "Biceps", exact: true }).check();
  await page.getByLabel(/Secondary Focus/).selectOption("triceps");
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(4);
  await cards(page).first().locator(".movement-row-toggle").click();
  await expect(page.locator(".movement-context-heading")).toHaveCount(0);
  await expect(cards(page).locator(".suggested-controls")).toHaveCount(0);
  await expect(page.locator(".workout-quick-actions")).toBeVisible();
  await cards(page)
    .first()
    .getByRole("button", { name: /^Manage / })
    .click();
  const edit = page.getByRole("dialog").locator(".suggested-controls");
  await edit
    .getByRole("button", { name: "Remove movement", exact: true })
    .click();
  await expect(cards(page)).toHaveCount(3);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await a.client.rpc("end_workout", { p_session: id, p_outcome: "abandoned" });
  const blank = await a.client.rpc("start_ad_hoc_workout");
  await page.goto(`/workout/${blank.data}`);
  await expect(cards(page)).toHaveCount(0);
  await expect(page.locator(".workout-quick-actions")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add exercises", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add movement", exact: true }).click();
  const add = page.getByRole("dialog");
  const option = await add
    .locator('option:not([value=""])')
    .first()
    .getAttribute("value");
  await add.getByRole("combobox").selectOption(option!);
  await add.getByRole("button", { name: "Add movement", exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  expect(catalog.exercises.length).toBe(183);
});
