import { expect, type Locator } from "@playwright/test";
export async function openSetSettings(row: Locator) {
  const gear = row.locator(".set-gear");
  if ((await gear.getAttribute("aria-expanded")) !== "true") await gear.click();
  await expect(row.locator(".set-settings-popover")).toBeVisible();
}
export async function closeSetSettings(row: Locator) {
  const close = row.getByRole("button", { name: /^Close Set \d+ settings$/ });
  if (await close.count()) await close.click();
}
export async function openMoreEffort(row: Locator) {
  await openSetSettings(row);
  const button = row.getByRole("button", { name: /^More effort options/ });
  if ((await button.getAttribute("aria-expanded")) === "false")
    await button.click();
}
export async function openAdvancedEffort(row: Locator) {
  await openSetSettings(row);
  const record = row.getByRole("button", {
    name: "Record effort",
    exact: true,
  });
  if (await record.isVisible()) await record.click();
  await openMoreEffort(row);
}
