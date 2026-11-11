import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("local Worker serves public-only offline fallback without Auth or database connectivity", async ({
  page,
}, info) => {
  await page.goto("/login");
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.context().setOffline(true);
  const response = await page.goto("/history");
  expect(response?.status()).toBe(503);
  await expect(
    page.getByRole("heading", { name: "Connection unavailable" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("worker-offline-shell.png"),
    fullPage: true,
  });
  const paths = await page.evaluate(async () => {
    const result = [];
    for (const name of await caches.keys())
      if (name.startsWith("body-public-offline-"))
        for (const r of await (await caches.open(name)).keys())
          result.push(new URL(r.url).pathname);
    return result.sort();
  });
  expect(paths).toEqual(["/icon.svg", "/offline"]);
  await page.context().setOffline(false);
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await writeFile(
    info.outputPath("worker-cache.json"),
    JSON.stringify(
      {
        originPort: new URL(page.url()).port,
        offlineStatus: response?.status(),
        paths,
        reconnected: true,
      },
      null,
      2,
    ),
  );
});
