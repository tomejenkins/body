import { expect, test } from "@playwright/test";
import { fixture } from "../audit/helpers";

async function controlled(page: import("@playwright/test").Page) {
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}
async function cachedPaths(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const result: string[] = [];
    for (const name of await caches.keys())
      if (name.startsWith("body-public-offline-")) {
        for (const request of await (await caches.open(name)).keys())
          result.push(new URL(request.url).pathname);
      }
    return result.sort();
  });
}
test("public offline fallback never persists private pages or replays mutations", async ({
  page,
}, info) => {
  await page.goto("/login");
  await controlled(page);
  await expect.poll(() => cachedPaths(page)).toEqual(["/icon.svg", "/offline"]);
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
  await page.context().setOffline(true);
  const response = await page.goto("/history?private=not-cached");
  expect(response?.status()).toBe(503);
  await expect(
    page.getByRole("heading", { name: "Connection unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
  await expect(
    page.getByText("Unconfirmed changes are not saved."),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("public-offline-shell.png"),
    fullPage: true,
  });
  await page.evaluate(async () => {
    for (const name of await caches.keys())
      if (name.startsWith("body-public-offline-")) await caches.delete(name);
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Body", exact: true }),
  ).toBeVisible();
  expect(await cachedPaths(page)).toEqual([]);
  await page.context().setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page).toHaveURL(/login/);
});
test("mounted logger preserves failed input and retries only on explicit save", async ({
  page,
}, info) => {
  const { a, row, item, session } = await fixture(page);
  await controlled(page);
  await page.context().setOffline(true);
  await row.getByRole("textbox", { name: /weight/ }).fill("157.5");
  await row.getByRole("textbox", { name: /weight/ }).press("Tab");
  await expect(row.locator(".set-save-state")).toHaveText("Not saved");
  await expect(page.locator(".connection-status")).toBeVisible();
  await expect(page.locator(".connection-status")).toHaveText(
    "Offline · saving needs a connection",
  );
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue(
    "157.5",
  );
  await expect(page).toHaveURL(new RegExp(`/workout/${session}`));
  await page.screenshot({
    path: info.outputPath("offline-retained-logger.png"),
    fullPage: true,
  });
  const current = async () =>
    a.client
      .from("workout_sets")
      .select("entered_weight,revision")
      .eq("workout_exercise_id", item)
      .eq("position", 1)
      .single();
  expect(Number((await current()).data?.entered_weight)).toBe(100);
  await page.context().setOffline(false);
  await expect(page.locator(".connection-status")).toBeEmpty();
  // Merely reconnecting does not replay a write or manufacture Saved.
  await expect(row.locator(".set-save-state")).toHaveText("Not saved");
  expect(Number((await current()).data?.entered_weight)).toBe(100);
  await row.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  expect(Number((await current()).data?.entered_weight)).toBe(157.5);
  expect(await cachedPaths(page)).toEqual(["/icon.svg", "/offline"]);
});
test("storage cache remains public through authenticated navigation and sign out", async ({
  page,
}) => {
  await fixture(page);
  await controlled(page);
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "Workout history", exact: true }),
  ).toBeVisible();
  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await page.goBack();
  await page.reload();
  await expect(page).toHaveURL(/login/);
  expect(await cachedPaths(page)).toEqual(["/icon.svg", "/offline"]);
});
