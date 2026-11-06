import { test, expect } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import programs from "../../supabase/catalog/programs.json" with { type: "json" };
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
const sizes = [
  [375, 667],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1440, 900],
] as const;
// One viewport matrix per runtime, rather than duplicating it in both projects.
for (const [width, height] of sizes)
  for (const theme of ["light", "dark"] as const) {
    test(`visual ${width}x${height} ${theme}`, async ({ page }, info) => {
      test.skip(
        info.project.name !== "desktop",
        "Matrix already includes mobile sizes",
      );
      test.setTimeout(180000);
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const a = await verifiedAccount();
      const bench = catalog.exercises.find(
        (e) => e.slug === "barbell_bench_press",
      )!;
      const w = await a.client.rpc("start_ad_hoc_workout");
      const e = await a.client.rpc("edit_workout", {
        p_session: w.data,
        p_operation: "add",
        p_exercise: bench.id,
      });
      const rows = await a.client
        .from("workout_sets")
        .select("id,revision")
        .eq("workout_exercise_id", e.data)
        .order("position");
      expect(
        (
          await a.client.rpc("log_workout_set", {
            p_item: e.data,
            p_id: rows.data![0].id,
            p_revision: rows.data![0].revision,
            p_operation: "save",
            p_mutation: crypto.randomUUID(),
            p_weight: 60,
            p_reps: 8,
            p_completed: true,
          })
        ).error,
      ).toBeNull();
      await a.client.rpc("end_workout", {
        p_session: w.data,
        p_outcome: "completed",
      });
      const shot = async (name: string) => {
        await expect(page.locator("h1:visible")).toHaveCount(1);
        await expect(page.locator("h1:visible")).not.toContainText(
          /Loading|Opening/,
        );
        await expect(page.locator('[aria-busy="true"]:visible')).toHaveCount(0);
        if (process.env.VISUAL_STAGE !== "before")
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            name,
          ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`${name}.png`),
          fullPage: true,
          animations: "disabled",
        });
      };
      await page.goto("/login");
      await shot("login");
      await page.getByLabel("Email address").fill(a.email);
      await page.getByLabel("Password", { exact: true }).fill(a.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/dashboard$/);
      for (const [name, path] of [
        ["dashboard", "/dashboard"],
        ["workout-entry", "/workout"],
        ...(process.env.VISUAL_STAGE !== "before"
          ? [["workout-setup", "/workout/new"]]
          : []),
        ["exercises", "/exercises"],
        ["exercise-detail", `/exercises/${bench.id}`],
        ["look-back", `/exercises/${bench.id}/history`],
        ["programs", "/programs"],
        ["program-detail", `/programs/${programs[0].id}`],
        ["history", "/history"],
        ["progress", "/history/progress"],
        ["records", "/history/records"],
        ["profile", "/profile"],
      ]) {
        await page.goto(path);
        if (name === "progress")
          await expect(
            page.getByRole("region", { name: "Training summary" }),
          ).toBeVisible();
        await shot(name);
      }
      const p = programs.find((p) => p.slug === "upper-lower-strength-size")!;
      const version = await a.client
        .from("programs")
        .select("published_version_id")
        .eq("id", p.id)
        .single();
      const started = await a.client.rpc("start_program_workout", {
        p_version: version.data!.published_version_id,
        p_workout: 1,
        p_request: crypto.randomUUID(),
      });
      expect(started.error).toBeNull();
      await page.goto(`/workout/${started.data}`);
      await shot("workout-home");
      await page
        .locator(".workout-movement-card")
        .first()
        .getByRole("button", { name: "Choose exercise", exact: true })
        .click();
      await shot("movement-selection");
      await page.locator(".movement-carousel button").first().click();
      await expect(page).toHaveURL(/exercise=/);
      await shot("exercise-logger");
      if (process.env.VISUAL_STAGE !== "before" && width <= 700) {
        await expect(
          page.getByRole("navigation", {
            name: "Main navigation",
            exact: true,
          }),
        ).toBeHidden();
        const boxes = await page
          .locator(".set-completion-control")
          .first()
          .boundingBox();
        expect(boxes?.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
