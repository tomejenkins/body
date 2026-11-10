import { expect, type Page } from "@playwright/test";
export async function openExerciseLogger(page: Page, name?: string) {
  await expect(
    page.getByRole("region", { name: "Workout Home", exact: true }),
  ).toBeVisible();
  const links = page.locator(".workout-home .workout-movement-card a");
  await (name ? links.filter({ hasText: name }) : links).first().click();
  await expect(
    page.getByRole("region", { name: "Exercise Logger", exact: true }),
  ).toBeVisible();
}
export async function backToWorkoutHome(page: Page) {
  await page
    .getByRole("link", { name: "Back to Workout Home", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Workout Home", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".logged-set")).toHaveCount(0);
}
export async function openWorkoutEnding(page: Page) {
  if (
    !(await page
      .getByRole("dialog", { name: "End workout?", exact: true })
      .isVisible())
  )
    await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "End workout?", exact: true }),
  ).toBeVisible();
}
export async function openWorkoutManagement(page: Page) {
  const details = page.locator(".workout-management");
  await expect(details).toBeVisible();
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
}
