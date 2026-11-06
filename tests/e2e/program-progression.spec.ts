import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { verifiedAccount } from "./auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(120000);
test("exact-exercise progression is optional, preserves manual input, survives refresh and reports rotation progress", async ({
  page,
}) => {
  const a = await verifiedAccount(),
    client = a.client;
  const user = (await client.auth.getUser()).data.user!;
  const bench = catalog.exercises.find(
    (e) => e.slug === "barbell_bench_press",
  )!;
  const root = await client
    .from("programs")
    .insert({
      owner_id: user.id,
      name: "Progression browser fixture",
      cycle_length: 3,
      objective: "hypertrophy",
    })
    .select("id")
    .single();
  expect(root.error).toBeNull();
  const program = root.data!.id;
  const rule = await client
    .from("program_progression_rules")
    .insert({
      owner_id: user.id,
      program_id: program,
      name: "Build reps",
      strategy: "double_progression",
      config_version: 1,
      load_step_kg: 2.5,
      rep_step: 1,
      reps_min: 8,
      reps_max: 12,
    })
    .select("id")
    .single();
  expect(rule.error).toBeNull();
  const days = await client
    .from("program_days")
    .insert(
      [1, 2, 3].map((n) => ({
        owner_id: user.id,
        program_id: program,
        cycle_length: 3,
        cycle_position: n,
        name: `Training ${n}`,
        is_rest_day: n === 3,
      })),
    )
    .select("id,cycle_position");
  expect(days.error).toBeNull();
  const slots = await client.from("program_slots").insert(
    days
      .data!.filter((d) => d.cycle_position < 3)
      .map((d) => ({
        owner_id: user.id,
        program_day_id: d.id,
        position: 1,
        exercise_id: bench.id,
        movement_pattern_id: catalog.movementPatterns.find(
          (p) => p.slug === "horizontal_push",
        )!.id,
        primary_muscle_id: catalog.muscleGroups.find(
          (m) => m.slug === "pectorals",
        )!.id,
        required_exercise_type: "compound",
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        progression_rule_id: rule.data!.id,
      })),
  );
  expect(slots.error).toBeNull();
  const version = await client.rpc("snapshot_program", { p_program: program });
  expect(version.error).toBeNull();
  const start = async () => {
    const r = await client.rpc("start_program_workout", {
      p_version: version.data,
      p_workout: 1,
      p_request: randomUUID(),
    });
    expect(r.error).toBeNull();
    return r.data as string;
  };
  const choose = async (w: string) => {
    const m = await client
      .from("workout_movements")
      .select("id")
      .eq("workout_session_id", w)
      .single();
    const e = await client.rpc("select_program_exercise", {
      p_movement: m.data!.id,
      p_exercise: bench.id,
      p_expected: null,
      p_request: randomUUID(),
      p_continue: false,
    });
    expect(e.error).toBeNull();
    return e.data as string;
  };
  const previous = await start(),
    item = await choose(previous);
  const sets = await client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", item)
    .order("position");
  for (const s of sets.data!) {
    const r = await client.rpc("log_workout_set", {
      p_item: item,
      p_id: s.id,
      p_operation: "save",
      p_revision: s.revision,
      p_mutation: randomUUID(),
      p_reps: 12,
      p_weight: 100,
      p_type: "working",
      p_completed: true,
    });
    expect(r.error).toBeNull();
  }
  expect(
    (
      await client.rpc("end_workout", {
        p_session: previous,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  const current = await start();
  await choose(current);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await page.goto(`/workout/${current}`);
  await page
    .getByRole("link", { name: "Open exercise logger", exact: true })
    .click();
  await expect(page.locator(".load-suggestion")).toContainText(
    "Suggested: 225 lb",
  );
  await expect(
    page
      .locator(".movement-carousel button")
      .first()
      .locator(".movement-match"),
  ).toHaveCount(0);
  const rows = page.locator(".logged-set");
  await rows
    .first()
    .getByRole("textbox", { name: /weight/ })
    .fill("77");
  await page.getByRole("button", { name: "Use suggested weight" }).click();
  await expect(
    rows.first().getByRole("textbox", { name: /weight/ }),
  ).toHaveValue("77");
  await expect(
    rows.nth(1).getByRole("textbox", { name: /weight/ }),
  ).toHaveValue("225");
  await rows.first().getByRole("textbox", { name: /reps/ }).fill("12");
  await rows
    .first()
    .getByRole("checkbox", { name: / complete$/ })
    .check();
  await expect(rows.first().locator(".set-save-state")).toHaveText(/^Saved/);
  await page.reload();
  await expect(
    rows.first().getByRole("textbox", { name: /weight/ }),
  ).toHaveValue("77");
  await expect(page.locator(".load-suggestion")).toContainText("225 lb");
  await page
    .getByRole("link", { name: "← Back to Workout Home", exact: true })
    .click();
  await expect(page).not.toHaveURL(/exercise=/);
  await page.goto(`/workout/${previous}`);
  await expect(page.getByRole("region", { name: "Next time" })).toContainText(
    "3/3 prescribed sets completed",
  );
  await expect(page.getByRole("region", { name: "Next time" })).toContainText(
    "3 met the rep target",
  );
  await page.goto("/programs");
  const progress = page.getByRole("region", { name: "Program progress" });
  await expect(progress).toContainText("1 completed workouts");
  await expect(progress).toContainText("Next: Workout 2 of 2");
  // No fixed carousel/logging overlay competes with navigation at either viewport.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
