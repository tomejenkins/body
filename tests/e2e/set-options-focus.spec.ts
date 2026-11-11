import { expect, test } from "@playwright/test";
import { collapseSetOptions } from "../../src/components/sets/set-options-focus";
test("native Options collapse keeps focus visible without stealing other-row focus", async ({
  page,
}) => {
  // Execute the imported shipping helper in Chromium, not a duplicate policy.
  await page.setContent(
    '<details open><summary>Options</summary><select aria-label="Effort"><option>RIR 0</option></select></details><button>Other row</button>',
  );
  const panel = await page.$("details");
  if (!panel) throw Error("Missing details");
  await page.getByRole("combobox", { name: "Effort" }).focus();
  await page.evaluate(collapseSetOptions, panel);
  await expect(page.locator("summary")).toBeFocused();
  await expect(page.locator("details")).not.toHaveAttribute("open", "");
  await page.locator("summary").click();
  await page.getByRole("button", { name: "Other row" }).focus();
  await page.evaluate(collapseSetOptions, panel);
  await expect(page.getByRole("button", { name: "Other row" })).toBeFocused();
});
