import type { Locator } from "@playwright/test";
export async function openMoreEffort(row: Locator) {
  const button = row.getByRole("button", { name: /^More effort options/ });
  if ((await button.getAttribute("aria-expanded")) === "false")
    await button.click();
}
export async function openAdvancedEffort(row: Locator) {
  const options = row.locator(".set-options");
  if ((await options.getAttribute("open")) === null)
    await options.locator(":scope > summary").click();
  const record = row.getByRole("button", {
    name: "Record effort",
    exact: true,
  });
  if (await record.isVisible()) await record.click();
  await openMoreEffort(row);
}
