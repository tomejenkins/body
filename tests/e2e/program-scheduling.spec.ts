import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { verifiedAccount, localAuth } from "./auth-helpers";
import { enrollFixture, seedLegacyEnrollment } from "./enrollment-helpers";
import { dateOffset } from "../../src/features/scheduling/model";
import { openWorkoutEnding } from "./workout-screen-helpers";
test.setTimeout(90000);
test.use({ actionTimeout: 10000 });
type Account = Awaited<ReturnType<typeof verifiedAccount>>;
async function login(page: Page, a: Account) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
}
async function fixture(a: Account, sets = 1, configured = true) {
  if (configured)
    expect(
      (
        await a.client
          .from("account_preferences")
          .update({ scheduling_timezone: "UTC" })
          .eq("owner_id", a.userId)
      ).error,
    ).toBeNull();
  const p = await a.client
    .from("programs")
    .insert({
      owner_id: a.userId,
      name: "Adaptive test rotation",
      cycle_length: 7,
      objective: "hypertrophy",
    })
    .select("id")
    .single();
  expect(p.error).toBeNull();
  const exercise = await a.client
    .from("exercises")
    .select("id")
    .eq("slug", "barbell_bench_press")
    .single();
  expect(exercise.error).toBeNull();
  const pattern = await a.client
    .from("movement_patterns")
    .select("id")
    .eq("slug", "horizontal_push")
    .single();
  const muscle = await a.client
    .from("muscle_groups")
    .select("id")
    .eq("slug", "pectorals")
    .single();
  for (let position = 1; position <= 7; position++) {
    const rest = ![1, 3, 5].includes(position);
    const d = await a.client
      .from("program_days")
      .insert({
        owner_id: a.userId,
        program_id: p.data!.id,
        cycle_length: 7,
        cycle_position: position,
        name: rest ? "Recovery" : `Training ${Math.ceil(position / 2)}`,
        is_rest_day: rest,
      })
      .select("id")
      .single();
    expect(d.error).toBeNull();
    if (!rest)
      expect(
        (
          await a.client.from("program_slots").insert({
            owner_id: a.userId,
            program_day_id: d.data!.id,
            position: 1,
            movement_pattern_id: pattern.data!.id,
            exercise_id: exercise.data!.id,
            target_sets: sets,
            target_reps_min: 8,
            target_reps_max: 12,
            required_exercise_type: "compound",
            primary_muscle_id: muscle.data!.id,
          })
        ).error,
      ).toBeNull();
  }
  const v = await a.client.rpc("snapshot_program", { p_program: p.data!.id });
  expect(v.error).toBeNull();
  if (configured) await enrollFixture(a, v.data as string);
  else seedLegacyEnrollment(a, v.data as string);
  const w = await a.client.rpc("start_program_workout", {
    p_version: v.data,
    p_workout: 1,
    p_request: crypto.randomUUID(),
  });
  expect(w.error).toBeNull();
  const assignment = await a.client
    .from("workout_sessions")
    .select("program_assignment_id")
    .eq("id", w.data)
    .single();
  return {
    version: v.data as string,
    session: w.data as string,
    assignment: assignment.data!.program_assignment_id as string,
    exercise: exercise.data!.id as string,
  };
}
function ageSchedule(a: Account, w: Awaited<ReturnType<typeof fixture>>) {
  localAuth();
  for (const id of [a.userId, w.assignment, w.session])
    if (!/^[0-9a-f-]{36}$/.test(id)) throw Error("Invalid fixture ID");
  execFileSync(
    "docker",
    [
      "--host=unix:///var/run/docker.sock",
      "exec",
      "supabase_db_body",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `update public.program_assignments set schedule_start_date=current_date-3 where id='${w.assignment}' and owner_id='${a.userId}'; update public.workout_sessions set schedule_due_on=current_date-3 where id='${w.session}' and owner_id='${a.userId}'`,
    ],
    { stdio: "pipe", env: process.env },
  );
}
const calendar = (page: Page) =>
  page.getByRole("region", { name: "Program calendar", exact: true });
test("weekly calendar carries missed training, preserves actual completion and supports adjacent weeks/themes", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  const w = await fixture(a);
  ageSchedule(a, w);
  await login(page, a);
  const before = await a.client.rpc("program_schedule");
  expect(before.error).toBeNull();
  const today = before.data.today as string;
  await page.goto(`/programs?week=${dateOffset(today, -3)}`);
  await expect(calendar(page).getByRole("listitem")).toHaveCount(7);
  await expect(
    calendar(page).getByText("Overdue · carried forward", { exact: true }),
  ).toBeVisible();
  await expect(
    calendar(page).locator(".schedule-recommendation"),
  ).toContainText("Training 1");
  await expect(
    calendar(page).locator(".schedule-recommendation"),
  ).toContainText("Carried forward");
  await page.reload();
  expect((await a.client.rpc("program_schedule")).data.next).toEqual(
    before.data.next,
  );
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("id", { count: "exact" })
        .eq("program_assignment_id", w.assignment)
    ).count,
  ).toBe(1);
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      if (width === 390 || width === 1440)
        await calendar(page).screenshot({
          path: info.outputPath(`calendar-${width}-${colorScheme}.png`),
          animations: "disabled",
        });
    }
  }
  const next = calendar(page).getByRole("link", { name: "Next week →" });
  await next.focus();
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`week=${dateOffset(today, 4)}`));
  await expect(
    calendar(page).getByText("Planned Rest", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    calendar(page).getByText("Scheduled", { exact: true }).first(),
  ).toBeVisible();
  await calendar(page).getByRole("link", { name: "← Previous week" }).click();
  await expect(page).toHaveURL(new RegExp(`week=${dateOffset(today, -3)}`));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workout/${w.session}`);
  await page.locator(".movement-row-toggle").first().click();
  await page.locator(".movement-carousel button").first().click();
  const row = page.locator(".logged-set").first();
  await row.getByRole("textbox", { name: /weight in pounds/ }).fill("100");
  await row.getByRole("textbox", { name: / reps$/ }).fill("8");
  await row.getByRole("checkbox", { name: / complete$/ }).check();
  await expect(row.getByRole("status")).toContainText("Saved");
  await openWorkoutEnding(page);
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/complete$/);
  const closed = await a.client
    .from("workout_sessions")
    .select("finished_at")
    .eq("id", w.session)
    .single();
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: w.session,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("finished_at")
        .eq("id", w.session)
        .single()
    ).data,
  ).toEqual(closed.data);
  await page.goto(`/programs?week=${dateOffset(today, -3)}`);
  await expect(
    calendar(page).getByText("Completed", { exact: true }),
  ).toBeVisible();
  await expect(
    calendar(page).getByText("Overdue · carried forward", { exact: true }),
  ).toBeVisible();
  await expect(
    calendar(page).locator(".schedule-recommendation"),
  ).toContainText("Training 2");
  await page.emulateMedia({ colorScheme: "light" });
  await calendar(page).screenshot({
    path: info.outputPath("calendar-completed.png"),
    animations: "disabled",
  });
});
test("legacy calendar requires explicit initialization and competing configuration is protected", async ({
  page,
}) => {
  const a = await verifiedAccount();
  const w = await fixture(a, 2, false);
  await login(page, a);
  await page.goto("/programs");
  await expect(
    calendar(page).getByText("Initialize your calendar", { exact: true }),
  ).toBeVisible();
  await calendar(page)
    .getByLabel("Scheduling timezone", { exact: true })
    .fill("America/New_York");
  await calendar(page)
    .getByRole("button", { name: "Use device timezone", exact: true })
    .click();
  await calendar(page)
    .getByLabel("Scheduling timezone", { exact: true })
    .fill("UTC");
  await calendar(page).getByLabel("Use this timezone for scheduling").check();
  await calendar(page)
    .getByRole("button", { name: "Initialize schedule", exact: true })
    .click();
  await expect(calendar(page).getByRole("listitem")).toHaveCount(7);
  const state = (await a.client.rpc("program_schedule")).data;
  expect(state.timezone).toBe("UTC");
  expect(state.next.position).toBe(1);
  const races = await Promise.all(
    [1, 2].map(() =>
      a.client.rpc("configure_program_schedule", {
        p_assignment: w.assignment,
        p_start: state.today,
        p_timezone: "Europe/London",
        p_request: crypto.randomUUID(),
      }),
    ),
  );
  expect(races.every((r) => r.error?.code === "23514")).toBe(true);
  const m = await a.client
    .from("workout_movements")
    .select("id")
    .eq("workout_session_id", w.session)
    .single();
  const item = await a.client.rpc("select_program_exercise", {
    p_movement: m.data!.id,
    p_exercise: w.exercise,
    p_expected: null,
    p_request: crypto.randomUUID(),
  });
  expect(item.error).toBeNull();
  const set = await a.client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", item.data)
    .order("position")
    .limit(1)
    .single();
  expect(
    (
      await a.client.rpc("log_workout_set", {
        p_item: item.data,
        p_id: set.data!.id,
        p_operation: "save",
        p_revision: set.data!.revision,
        p_mutation: crypto.randomUUID(),
        p_reps: 8,
        p_weight: 50,
        p_type: "working",
        p_completed: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: w.session,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  await page.reload();
  await expect(
    calendar(page).getByText("Partial training recorded", { exact: true }),
  ).toBeVisible();
  expect((await a.client.rpc("program_schedule")).data.next.position).toBe(1);
  await page.setViewportSize({ width: 375, height: 667 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("initial configuration races serialize and retries cannot duplicate scheduling identity", async () => {
  const a = await verifiedAccount();
  const w = await fixture(a, 1, false);
  const start = new Date().toISOString().slice(0, 10);
  const commands = [crypto.randomUUID(), crypto.randomUUID()];
  const results = await Promise.all(
    commands.map((p_request) =>
      a.client.rpc("configure_program_schedule", {
        p_assignment: w.assignment,
        p_start: start,
        p_timezone: "UTC",
        p_request,
      }),
    ),
  );
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(results.filter((r) => r.error?.code === "23514")).toHaveLength(1);
  const winner = results.findIndex((r) => !r.error);
  const retry = await a.client.rpc("configure_program_schedule", {
    p_assignment: w.assignment,
    p_start: start,
    p_timezone: "UTC",
    p_request: commands[winner],
  });
  expect(retry.error).toBeNull();
  expect(retry.data).toEqual(results[winner].data);
  expect(
    (
      await a.client
        .from("program_assignments")
        .select("id", { count: "exact" })
        .eq("owner_id", a.userId)
        .eq("state", "active")
    ).count,
  ).toBe(1);
  const other = await verifiedAccount();
  expect(
    (await other.client.rpc("program_schedule", { p_assignment: w.assignment }))
      .data,
  ).toBeNull();
});
