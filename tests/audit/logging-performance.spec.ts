import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fixture } from "./helpers";
test("measure acknowledged saves under reproducible browser network profiles", async ({
  page,
}, info) => {
  const { a, row, item } = await fixture(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const profiles =
    process.env.BODY_AUDIT_CONTROL === "1"
      ? [{ name: "control-local", latency: 0, down: -1, up: -1 }]
      : [
          { name: "local", latency: 0, down: -1, up: -1 },
          { name: "mobile-80ms", latency: 80, down: 1_250_000, up: 250_000 },
          { name: "mobile-300ms", latency: 300, down: 200_000, up: 64_000 },
        ];
  if (process.env.BODY_AUDIT_STRESS === "1") {
    profiles.push({
      name: "slow-bandwidth-80ms-cpu4",
      latency: 80,
      down: 32000,
      up: 8000,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  const samples: unknown[] = [];
  let batch: { requestBytes: number; action: boolean }[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      batch.push({
        requestBytes: request.postDataBuffer()?.length ?? 0,
        action: !!request.headers()["next-action"],
      });
  });
  await page.evaluate(() => {
    const w = window as Window & {
      auditLongTasks?: number[];
      auditSavedAt?: number;
    };
    w.auditLongTasks = [];
    const status = document.querySelector(".logged-set .set-save-state");
    if (!status) throw Error("Saved-state probe missing");
    new MutationObserver(() => {
      if (status.textContent?.trim() === "Saved")
        w.auditSavedAt = performance.now();
    }).observe(status, { childList: true, subtree: true, characterData: true });

    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.auditLongTasks!.push(e.duration);
    }).observe({ type: "longtask", buffered: false });
  });
  for (const profile of profiles) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.down,
      uploadThroughput: profile.up,
    });
    for (let n = 0; n < 12; n++) {
      // Keyboard blur invokes the unchanged logger's ordinary saved-set edit.
      batch = [];
      const before = await page.evaluate(() => {
        (window as Window & { auditSavedAt?: number }).auditSavedAt = undefined;
        return performance.now();
      });
      await row.getByRole("textbox", { name: /weight/ }).fill(String(101 + n));
      await row.getByRole("textbox", { name: /weight/ }).press("Tab");
      await expect(row.locator(".set-save-state")).toHaveText("Saved");
      const confirmed = await page.evaluate(() => performance.now());
      // Wait for the existing asynchronous continuity read to settle; excluded from acknowledgement latency.
      await expect
        .poll(() =>
          page.evaluate(
            (start) =>
              performance
                .getEntriesByType("resource")
                .filter(
                  (e) =>
                    e.startTime >= start &&
                    (e as PerformanceResourceTiming).initiatorType === "fetch",
                ).length,
            before,
          ),
        )
        .toBe(2);
      const resources = await page.evaluate(
        (start) =>
          performance
            .getEntriesByType("resource")
            .filter(
              (e) =>
                e.startTime >= start &&
                (e as PerformanceResourceTiming).initiatorType === "fetch",
            )
            .map((e) => {
              const r = e as PerformanceResourceTiming;
              return {
                start: r.startTime,
                responseEnd: r.responseEnd,
                duration: r.duration,
                responseStart: r.responseStart,
                transferBytes: r.transferSize,
                encodedBodyBytes: r.encodedBodySize,
                decodedBodyBytes: r.decodedBodySize,
              };
            }),
        before,
      );
      const current = await a.client
        .from("workout_sets")
        .select("actual_reps,entered_weight,entered_unit,status,revision")
        .eq("workout_exercise_id", item)
        .eq("position", 1)
        .single();
      expect(current.data?.status).toBe("completed");
      expect(current.data?.actual_reps).toBe(8);
      expect(Number(current.data?.entered_weight)).toBe(101 + n);
      samples.push({
        profile: profile.name,
        n,
        acknowledgementMs: confirmed - before,
        observedDomSavedAt: await page.evaluate(
          () => (window as Window & { auditSavedAt?: number }).auditSavedAt,
        ),
        operationStart: before,
        requests: [...batch],
        requestCount: resources.length,
        resources,
      });
    }
  }
  const longTasks = await page.evaluate(
    () => (window as Window & { auditLongTasks?: number[] }).auditLongTasks,
  );
  await writeFile(
    info.outputPath("logging-samples.json"),
    JSON.stringify(
      {
        profiles,
        cpuThrottle: process.env.BODY_AUDIT_STRESS === "1" ? 4 : 1,
        samples,
        longTasks,
        timeOrigin: await page.evaluate(() => performance.timeOrigin),
      },
      null,
      2,
    ),
  );
  await cdp.detach();
});
