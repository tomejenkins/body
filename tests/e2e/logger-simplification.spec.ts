import { expect, test, type Locator, type Page } from "@playwright/test";
import { fixture } from "../audit/helpers";
import { verifiedAccount } from "./auth-helpers";
import { enrollFromDetail } from "./enrollment-helpers";
import { loginSelection } from "./selection-helpers";
import { backToWorkoutHome } from "./workout-screen-helpers";
import { openMoreEffort } from "./set-options-helpers";
import programs from "../../supabase/catalog/programs.json" with { type: "json" };

test.setTimeout(120000);
async function pendingRow(page: Page) {
  const context = await fixture(page),
    row = page.locator(".logged-set").nth(1);
  await row.getByRole("textbox", { name: /weight/ }).fill("125");
  await row.getByRole("textbox", { name: / reps$/ }).fill("8");
  await row.getByRole("textbox", { name: / reps$/ }).press("Tab");
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  await row.locator(".set-options > summary").click();
  return { ...context, row };
}
async function holdCompletion(page: Page) {
  let release = () => {},
    arrive = () => {},
    held = false;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    arrived = new Promise<void>((resolve) => {
      arrive = resolve;
    });
  await page.route("**/workout/**", async (route) => {
    let command;
    try {
      command = JSON.parse(route.request().postData() ?? "[]")[0];
    } catch {}
    if (
      !held &&
      route.request().method() === "POST" &&
      command?.operation === "save" &&
      command?.completed === true
    ) {
      held = true;
      const response = await route.fetch();
      arrive();
      await gate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  return { release, arrived };
}
async function logRow(row: Locator) {
  await row.getByRole("textbox", { name: /weight/ }).fill("100");
  await row.getByRole("textbox", { name: / reps$/ }).fill("8");
  await row.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(row.locator(".set-save-state")).toHaveText(/^Saved/);
}
test("only confirmed completion collapses its Options and preserves every set", async ({
  page,
}, info) => {
  const { row, a, item } = await pendingRow(page);
  const options = row.locator(".set-options"),
    other = page.locator(".logged-set").nth(2).locator(".set-options");
  await other.locator(":scope > summary").click();
  await expect(
    row.getByRole("button", { name: /Discard this draft/ }),
  ).toHaveCount(0);
  await expect(
    row.getByRole("combobox", { name: /effort rating/ }),
  ).toHaveCount(0);
  const held = await holdCompletion(page);
  await row.getByRole("checkbox", { name: / complete$/ }).check();
  await held.arrived;
  await expect(row.locator(".set-save-state")).toHaveText("Saving…");
  await expect(options).toHaveAttribute("open", "");
  held.release();
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  await expect(options).not.toHaveAttribute("open", "");
  await expect(other).toHaveAttribute("open", "");
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue("125");
  await expect(row.getByRole("textbox", { name: / reps$/ })).toHaveValue("8");
  await expect(row.getByRole("checkbox", { name: / complete$/ })).toBeChecked();
  await page.screenshot({
    path: info.outputPath("confirmed-options-collapsed.png"),
    fullPage: true,
  });
  await options.locator(":scope > summary").click();
  await expect(options).toHaveAttribute("open", "");
  await row.getByRole("textbox", { name: / reps$/ }).fill("9");
  await row.getByRole("textbox", { name: / reps$/ }).press("Tab");
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  await expect(options).toHaveAttribute("open", "");
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("id")
        .eq("workout_exercise_id", item)
    ).data,
  ).toHaveLength(3);
  await page.reload();
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  await expect(row.getByRole("textbox", { name: / reps$/ })).toHaveValue("9");
  await expect(row.locator(".set-options")).not.toHaveAttribute("open", "");
});
test("offline completion keeps Options, entered values and recovery until explicit retry", async ({
  page,
}, info) => {
  const { row, a } = await pendingRow(page),
    id = await row.getAttribute("data-set-id");
  await page.context().setOffline(true);
  await row.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(row.locator(".set-save-state")).toHaveText("Not saved");
  await expect(row.locator(".set-options")).toHaveAttribute("open", "");
  await expect(
    row.getByRole("button", { name: /Discard this draft/ }),
  ).toBeVisible();
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue("125");
  expect(
    (await a.client.from("workout_sets").select("status").eq("id", id).single())
      .data?.status,
  ).toBe("pending");
  await page.screenshot({
    path: info.outputPath("offline-recoverable-options.png"),
    fullPage: true,
  });
  await page.context().setOffline(false);
  await expect(row.locator(".set-save-state")).toHaveText("Not saved");
  await row.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  await expect(row.locator(".set-options")).not.toHaveAttribute("open", "");
});
for (const action of ["reopen", "edit"] as const)
  test(`a newer ${action} survives the older completion response`, async ({
    page,
  }) => {
    const { row, a } = await pendingRow(page),
      id = await row.getAttribute("data-set-id"),
      held = await holdCompletion(page);
    await row.getByRole("checkbox", { name: / complete$/ }).check();
    await held.arrived;
    if (action === "reopen") {
      await row.locator(".set-options > summary").click();
      await row.locator(".set-options > summary").click();
    } else await row.getByRole("textbox", { name: /weight/ }).fill("130");
    held.release();
    await expect(row.locator(".set-save-state")).toHaveText(
      action === "edit" ? "Unsaved changes" : "Saved",
    );
    await expect(row.locator(".set-options")).toHaveAttribute("open", "");
    if (action === "edit") {
      await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue(
        "130",
      );
      expect(
        Number(
          (
            await a.client
              .from("workout_sets")
              .select("entered_weight")
              .eq("id", id)
              .single()
          ).data?.entered_weight,
        ),
      ).toBe(125);
      await row.getByRole("textbox", { name: /weight/ }).press("Tab");
      await expect(row.locator(".set-save-state")).toHaveText("Saved");
      await expect(row.locator(".set-options")).toHaveAttribute("open", "");
    }
  });
test("Next Exercise returns to collapsed same-session Home with full, partial and unstarted progress", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    p = programs.find((p) => p.slug === "upper-lower-strength-size");
  if (!p) throw Error("Missing official fixture");
  await loginSelection(page, a);
  await page.goto(`/programs/${p.id}`);
  await enrollFromDetail(page, `/programs/${p.id}`);
  await page
    .getByRole("button", { name: "Start Workout 1", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  const path = new URL(page.url()).pathname,
    session = path.split("/").pop();
  const cards = page.locator(".workout-home .workout-movement-card");
  await cards
    .first()
    .getByRole("button", { name: /^Choose exercise/ })
    .click();
  await page.locator(".movement-carousel button").first().click();
  await expect(
    page.getByRole("region", { name: "Exercise Logger", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".logged-set")).toHaveCount(3);
  const selected = page.locator("h1");
  const firstName = await selected.textContent();
  for (const row of await page.locator(".logged-set").all()) await logRow(row);
  await page
    .getByRole("button", { name: "Next Exercise", exact: true })
    .click();
  await expect(page).toHaveURL(path);
  await expect(
    page.locator(".movement-row-toggle[aria-expanded=true]"),
  ).toHaveCount(0);
  await expect(cards.first()).toContainText(firstName ?? "");
  await expect(cards.first()).toContainText("3/3 working sets complete");
  await expect(cards.first().locator(".movement-status")).toHaveAttribute(
    "data-status",
    "Complete",
  );
  await cards
    .nth(1)
    .getByRole("button", { name: /^Choose exercise/ })
    .click();
  await page.locator(".movement-carousel button").first().click();
  await expect(
    page.getByRole("region", { name: "Exercise Logger", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".logged-set")).toHaveCount(3);
  await logRow(page.locator(".logged-set").first());
  await backToWorkoutHome(page);
  await expect(cards.nth(1)).toContainText("1/3 working sets complete");
  await expect(cards.nth(1).locator(".movement-status")).toHaveAttribute(
    "data-status",
    "In Progress",
  );
  const snapshot = async () => ({
    session: (
      await a.client
        .from("workout_sessions")
        .select(
          "id,status,started_at,manual_pause_intervals,source_program_version_id,source_program_day_id",
        )
        .eq("id", session)
        .single()
    ).data,
    items: (
      await a.client
        .from("workout_exercises")
        .select("id,exercise_id,position,status")
        .eq("workout_session_id", session)
        .order("position")
    ).data,
    assignments: (
      await a.client
        .from("program_assignments")
        .select("*")
        .eq("owner_id", a.userId)
    ).data,
  });
  const before = await snapshot();
  await cards
    .first()
    .getByRole("button", { name: /Choose or change/ })
    .click();
  await cards
    .first()
    .getByRole("link", { name: "Open exercise logger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Next Exercise", exact: true })
    .click();
  await expect(page).toHaveURL(path);
  await expect(
    page.locator(".movement-row-toggle[aria-expanded=true]"),
  ).toHaveCount(0);
  await expect(page.locator(".movement-carousel")).toHaveCount(0);
  await expect(cards.nth(1)).toContainText("1/3 working sets complete");
  await expect(cards.nth(2).locator(".movement-status")).toHaveAttribute(
    "data-status",
    "Not Started",
  );
  expect(await snapshot()).toEqual(before);
  await page.screenshot({
    path: info.outputPath("collapsed-home-partial-and-complete.png"),
    fullPage: true,
  });
  await cards
    .nth(1)
    .getByRole("button", { name: /Choose or change/ })
    .click();
  await expect(page.locator(".movement-carousel")).toHaveCount(1);
});
test("compact optional controls and accessible help fit all requested mobile themes", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "mobile",
    "One matrix already covers the mobile widths in both themes.",
  );
  const { row } = await pendingRow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await row.locator(".set-options > summary").click();
  await page.screenshot({
    path: info.outputPath("normal-saved-options-collapsed.png"),
    fullPage: true,
  });
  await row.locator(".set-options > summary").click();
  for (const width of [375, 390, 430])
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme });
      await row
        .locator(".set-option-body")
        .evaluate((element) => element.scrollIntoView({ block: "center" }));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`compact-options-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const scale of ["rpe", "rir"] as const) {
    if (scale === "rir") {
      await openMoreEffort(row);
      await row
        .getByRole("combobox", { name: /effort scale/ })
        .selectOption("rir");
      await expect(row.locator(".set-save-state")).toHaveText("Saved");
    }
    const help = row.getByRole("button", {
      name: `About ${scale.toUpperCase()}`,
      exact: true,
    });
    await help.click();
    const dialog = page.getByRole("dialog", {
      name: `${scale.toUpperCase()} help`,
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: info.outputPath(`${scale}-help-390.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(help).toBeFocused();
    await help.click();
    await page.mouse.click(1, 1);
    await expect(dialog).toHaveCount(0);
  }
  await row.getByRole("checkbox", { name: /To Failure/ }).check();
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  await page.screenshot({
    path: info.outputPath("rare-failure-options.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("options-200-percent.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await row.getByRole("textbox", { name: /weight/ }).focus();
  await expect(row.getByRole("textbox", { name: /weight/ })).toBeFocused();
  await page.screenshot({
    path: info.outputPath("mobile-focused-input-keyboard-unverified.png"),
    fullPage: true,
  });
});
