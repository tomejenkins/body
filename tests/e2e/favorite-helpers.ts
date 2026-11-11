import { expect, type Page } from "@playwright/test";
export async function favoriteEditor(
  page: Page,
  name: string,
  action: "Rename" | "Remove",
) {
  await page
    .getByRole("button", { name: `Manage ${name}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: `${action} Favorite`,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function renameFavorite(page: Page, name: string, next: string) {
  const dialog = await favoriteEditor(page, name, "Rename");
  await dialog.getByLabel("New name").fill(next);
  await dialog
    .getByRole("button", { name: "Rename Favorite", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: next, exact: true }),
  ).toBeVisible();
}
