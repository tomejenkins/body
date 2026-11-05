import { expect, test } from "@playwright/test";
import { loginForNavigation } from "./auth-helpers";
test.beforeEach(async ({ page }) => {
  await loginForNavigation(page);
});
const routes = [
  ["Dashboard", "Show up for yourself."],
  ["Workout", "Your next rep starts here."],
  ["Programs", "Programs"],
  ["History", "Workout history"],
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

test("navigation uses the right placement and usable touch targets", async ({
  page,
}, testInfo) => {
  await page.goto("/dashboard");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("This check requires a fixed viewport");
  const sidebar = page.locator(".desktop-sidebar");
  await expect(sidebar).toHaveCSS("position", "fixed");
  const bounds = await sidebar.boundingBox();
  if (!bounds) throw new Error("Navigation must be visible");
  if (testInfo.project.name === "mobile") {
    expect(bounds.width).toBe(viewport.width);
    expect(
      Math.abs(bounds.y + bounds.height - viewport.height),
    ).toBeLessThanOrEqual(1);
    const links = page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link");
    for (const link of await links.all()) {
      const target = await link.boundingBox();
      if (!target) throw new Error("Navigation link must be visible");
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
    await page.setViewportSize({ width: 320, height: 568 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } else {
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.height).toBe(viewport.height);
    expect(bounds.width).toBeLessThan(viewport.width / 2);
  }
});

test("theme follows system changes without navigation", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/dashboard");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(247, 248, 245)",
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(18, 21, 18)",
  );
  await expect(
    page.getByRole("link", { name: "Explore your workout space" }),
  ).toHaveCSS("color", "rgb(24, 40, 25)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(247, 248, 245)",
  );
});
