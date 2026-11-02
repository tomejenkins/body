import { expect, test } from "@playwright/test";
const routes = [
  ["Dashboard", "Show up for yourself."],
  ["Workout", "Your next rep starts here."],
  ["Programs", "Structure for your ambition."],
  ["History", "Every effort adds up."],
  ["Feed", "Progress is personal."],
  ["Profile", "Your space. Your pace."],
];
test("all destinations render, navigation tracks the route, and layouts fit", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Explore your workout space" }),
  ).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page).toHaveURL(/\/dashboard$/);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const [label, heading] of routes) {
    const link = nav.getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
test("system dark mode and PWA manifest are available", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/dashboard");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(18, 21, 18)",
  );
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    start_url: "/dashboard",
    display: "standalone",
  });
});
test("keyboard users can skip navigation", async ({ page }) => {
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});
