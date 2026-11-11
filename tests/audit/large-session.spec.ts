import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fixture } from "./helpers";
test("profile bounded 100-set logger without changing set structure or inputs", async ({
  page,
}, info) => {
  const { a, session, item } = await fixture(page);
  for (let n = 3; n < 100; n++) {
    const added = await a.client.rpc("log_workout_set", {
      p_item: item,
      p_id: crypto.randomUUID(),
      p_operation: "add",
      p_revision: 0,
      p_mutation: crypto.randomUUID(),
      p_reps: null,
      p_weight: null,
      p_completed: false,
    });
    expect(added.error).toBeNull();
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const start = Date.now();
  await page.goto(`/workout/${session}?exercise=${item}`);
  await expect(page.locator(".logged-set")).toHaveCount(100);
  const readinessMs = Date.now() - start;
  const samples = [];
  for (let n = 0; n < 5; n++) {
    const row = page.locator(".logged-set").first(),
      at = Date.now();
    await row.getByRole("textbox", { name: /weight/ }).fill(String(151 + n));
    await row.getByRole("textbox", { name: /weight/ }).press("Tab");
    await expect(row.locator(".set-save-state")).toHaveText("Saved");
    samples.push(Date.now() - at);
  }
  const metrics = await cdp.send("Performance.getMetrics");
  await writeFile(
    info.outputPath("large-session.json"),
    JSON.stringify(
      {
        sets: 100,
        cpuThrottle: 4,
        readinessMs,
        automationSaveMs: samples,
        metrics: metrics.metrics.filter((m: { name: string }) =>
          [
            "JSHeapUsedSize",
            "Nodes",
            "TaskDuration",
            "ScriptDuration",
            "LayoutDuration",
          ].includes(m.name),
        ),
      },
      null,
      2,
    ),
  );
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("id")
        .eq("workout_exercise_id", item)
    ).data,
  ).toHaveLength(100);
});
