import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fixture } from "./helpers";
// Keep CDP page-target emulation comparable: a worker fetch has its own target.
test.use({ serviceWorkers: "block" });
test("measure private route readiness and offline navigation limits", async ({
  page,
}, info) => {
  const { session, item } = await fixture(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const samples = [];
  for (const latency of [0, 80, 300]) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency,
      downloadThroughput: latency ? 200000 : -1,
      uploadThroughput: latency ? 64000 : -1,
    });
    for (let n = 0; n < 5; n++)
      for (const [name, path, selector] of [
        ["dashboard", "/dashboard", ".training-week"],
        ["workout-home", `/workout/${session}`, ".workout-mode-controls"],
        ["exercise", `/workout/${session}?exercise=${item}`, ".logged-set"],
        ["programs", "/programs", ".program-card-grid"],
        ["history", "/history", ".history-filters"],
      ]) {
        const start = Date.now();
        await page.goto(path);
        await expect(page.locator(selector).first()).toBeVisible();
        const resources = await page.evaluate(() =>
          performance.getEntriesByType("resource").map((e) => ({
            bytes: (e as PerformanceResourceTiming).transferSize,
            duration: e.duration,
          })),
        );
        samples.push({
          name,
          latency,
          n,
          readyMs: Date.now() - start,
          resources: resources.length,
          bytes: resources.reduce((s, r) => s + r.bytes, 0),
        });
      }
  }
  await writeFile(
    info.outputPath("navigation-samples.json"),
    JSON.stringify(
      { samples, performance: await cdp.send("Performance.getMetrics") },
      null,
      2,
    ),
  );
});
