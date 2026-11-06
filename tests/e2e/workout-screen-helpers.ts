import { expect, type Page } from "@playwright/test";
export async function openExerciseLogger(page: Page, name?: string) {
  await expect(
    page.getByRole("region", { name: "Workout Home", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: name ? `Log ${name}` : /^Log /, exact: !!name })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "Exercise Logger", exact: true }),
  ).toBeVisible();
}
export async function backToWorkoutHome(page: Page) {
  await page
    .getByRole("link", { name: "← Back to Workout Home", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Workout Home", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".logged-set")).toHaveCount(0);
}
