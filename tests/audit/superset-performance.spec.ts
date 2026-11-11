import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { verifiedAccount } from "../e2e/auth-helpers";
import { loginSelection } from "../e2e/selection-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };

test("controlled ordinary versus grouped row saves share the same operation count", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const results = [];
  for (const latency of [0, 150])
    for (const grouped of [false, true]) {
      const exercises = ["barbell_bench_press", "standing_dumbbell_curl"].map(
        (slug) => catalog.exercises.find((e) => e.slug === slug)!.id,
      );
      const w = await a.client.rpc("start_exercise_workout", {
        p_exercises: exercises,
        p_request: randomUUID(),
      });
      expect(w.error).toBeNull();
      const selections = await a.client
        .from("workout_exercises")
        .select("id")
        .eq("workout_session_id", w.data)
        .order("position");
      expect(selections.error).toBeNull();
      let query = `exercise=${selections.data![0].id}`;
      if (grouped) {
        const movements = await a.client
          .from("workout_movements")
          .select("id")
          .eq("workout_session_id", w.data)
          .order("position");
        const id = randomUUID();
        expect(
          (
            await a.client.rpc("change_workout_group", {
              p_session: w.data,
              p_group: id,
              p_operation: "create",
              p_expected: 0,
              p_members: movements.data!.map((m) => ({
                type: "movement",
                id: m.id,
              })),
              p_request: randomUUID(),
            })
          ).error,
        ).toBeNull();
        query = `group=${id}`;
      }
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency,
        downloadThroughput: 1024 * 1024,
        uploadThroughput: 512 * 1024,
      });
      const navigationStart = performance.now();
      await page.goto(`/workout/${w.data}?${query}`);
      await expect(page.locator(".logged-set")).toHaveCount(grouped ? 6 : 3);
      const loadMs = performance.now() - navigationStart;
      const commands: { operation: string; completed?: boolean }[] = [];
      const observe = (r: import("@playwright/test").Request) => {
        if (r.method() === "POST")
          try {
            const c = JSON.parse(r.postData() ?? "[]")[0];
            if (c?.operation) commands.push(c);
          } catch {}
      };
      page.on("request", observe);
      const durations = [];
      for (let i = 0; i < 3; i++) {
        const row = page.locator(".logged-set").nth(grouped ? i * 2 : i);
        await row.getByRole("textbox", { name: /weight/ }).fill("100");
        await row.getByRole("textbox", { name: / reps$/ }).fill("8");
        const start = performance.now();
        await row.getByRole("checkbox", { name: / complete$/ }).click();
        await expect(row.locator(".set-save-state")).toHaveText("Saved");
        await expect(
          row.getByRole("checkbox", { name: / complete$/ }),
        ).toBeChecked();
        durations.push(Math.round(performance.now() - start));
      }
      page.off("request", observe);
      expect(
        commands.filter((c) => c.operation === "save" && c.completed),
      ).toHaveLength(3);
      expect(
        commands.filter((c) =>
          ["create", "edit", "ungroup"].includes(c.operation),
        ),
      ).toHaveLength(0);
      results.push({
        latencyMs: latency,
        mode: grouped ? "superset" : "ordinary",
        navigationToRowsMs: Math.round(loadMs),
        doneToSavedMs: durations,
        saveRequests: commands.length,
        completedSaveRequests: 3,
        groupingWritesDuringSets: 0,
        pickerCount: await page.locator(".movement-carousel").count(),
        domNodes: await page.locator("*").count(),
      });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      expect(
        (
          await a.client.rpc("end_workout", {
            p_session: w.data,
            p_outcome: "abandoned",
          })
        ).error,
      ).toBeNull();
    }
  await writeFile(
    info.outputPath("measurements.json"),
    JSON.stringify(
      {
        environment:
          "Local production Next.js, Chromium CDP emulation; three saved rows per cell; descriptive samples, not a cellular benchmark",
        results,
      },
      null,
      2,
    ),
  );
});
