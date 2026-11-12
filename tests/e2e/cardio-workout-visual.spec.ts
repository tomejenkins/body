import { test, expect } from "@playwright/test";
import { fixture } from "../audit/helpers";
import { openSetSettings, closeSetSettings } from "./set-options-helpers";
import { randomUUID } from "node:crypto";
test.setTimeout(180000);
test("gear and cardio sheets fit five viewports, themes, large text and keyboard clearance", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "One explicit matrix covers all five sizes in both themes.",
  );
  const c = await fixture(page);
  const row = page.locator(".logged-set").first();
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1440, 900],
  ])
    for (const colorScheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await openSetSettings(row);
      const box = await row.locator(".set-settings-popover").boundingBox(),
        footer = await page
          .getByRole("navigation", { name: "Workout controls", exact: true })
          .boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(footer!.y + 1);
      await page.screenshot({
        path: info.outputPath(`gear-${width}-${colorScheme}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(row.locator(".set-gear")).toBeFocused();
      await page.screenshot({
        path: info.outputPath(`row-${width}-${colorScheme}.png`),
      });
    }
  expect(
    (
      await c.a.client.rpc("record_workout_cardio", {
        p_session: c.session,
        p_item: randomUUID(),
        p_operation: "add",
        p_expected: 0,
        p_activity: "elliptical",
        p_seconds: null,
        p_request: randomUUID(),
      })
    ).error,
  ).toBeNull();
  await page.goto(`/workout/${c.session}`);
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1440, 900],
  ])
    for (const colorScheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.locator(".cardio-card").getByRole("button").click();
      const sheet = page.getByRole("dialog", {
        name: "Edit Elliptical cardio",
        exact: true,
      });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("textbox").fill("20");
      const box = await sheet.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: info.outputPath(`cardio-${width}-${colorScheme}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
    }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".cardio-card").getByRole("button").click();
  const editor = page.getByRole("dialog", {
    name: "Edit Elliptical cardio",
    exact: true,
  });
  await editor.getByRole("textbox").focus();
  await page.evaluate(() => {
    const v = window.visualViewport;
    if (!v) throw Error("visualViewport unavailable");
    Object.defineProperty(v, "height", { configurable: true, value: 544 });
    v.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(() =>
      page
        .locator(".workout-execution")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--workout-keyboard-inset"),
        ),
    )
    .toBe("300px");
  const keyboardBox = await editor.boundingBox();
  expect(keyboardBox!.y + keyboardBox!.height).toBeLessThanOrEqual(545);
  await page.screenshot({
    path: info.outputPath("cardio-keyboard-emulation.png"),
  });
  await page.evaluate(() => {
    const v = window.visualViewport;
    if (v) {
      delete (v as unknown as Record<string, unknown>).height;
      v.dispatchEvent(new Event("resize"));
    }
  });
  await page.keyboard.press("Escape");
  const style = await page.addStyleTag({
    content: "html{font-size:200% !important}",
  });
  await page.locator(".cardio-card").getByRole("button").click();
  await expect(editor).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("cardio-large-text.png") });
  await page.keyboard.press("Escape");
  await style.evaluate((e) => e.parentNode?.removeChild(e));
  await closeSetSettings(row);
});
