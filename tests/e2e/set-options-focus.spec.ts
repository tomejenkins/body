import { expect, test } from "@playwright/test";
import { fixture } from "../audit/helpers";
import { openSetSettings } from "./set-options-helpers";
test("gear settings return focus on Escape and do not steal focus from another row", async ({
  page,
}) => {
  await fixture(page);
  const row = page.locator(".logged-set").first(),
    other = page
      .locator(".logged-set")
      .nth(1)
      .getByRole("textbox", { name: / reps$/ });
  await openSetSettings(row);
  await page.keyboard.press("Escape");
  await expect(row.locator(".set-gear")).toBeFocused();
  await openSetSettings(row);
  const next = page.locator(".logged-set").nth(1);
  await next.locator(".set-gear").click();
  await expect(next.locator(".set-gear")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(row.locator(".set-gear")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.keyboard.press("Escape");
  await openSetSettings(row);
  await other.click();
  await expect(other).toBeFocused();
  await expect(row.locator(".set-gear")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
