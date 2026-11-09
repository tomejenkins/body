import { expect, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
export type Account = Awaited<ReturnType<typeof verifiedAccount>>;
export async function loginSelection(page: Page, a: Account) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
}
export async function selectionProgram(
  a: Account,
  n = 7,
  sets = 2,
  double = false,
  configured = true,
) {
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
      name: "Selection training",
      cycle_length: n,
      objective: "hypertrophy",
      duration_rotations: 2,
    })
    .select("id")
    .single();
  expect(p.error).toBeNull();
  let rule: string | null = null;
  if (double) {
    const r = await a.client
      .from("program_progression_rules")
      .insert({
        owner_id: a.userId,
        program_id: p.data!.id,
        name: "Double progression",
        strategy: "double_progression",
        config_version: 1,
        load_step_kg: 2.5,
        rep_step: 1,
        reps_min: 8,
        reps_max: 12,
      })
      .select("id")
      .single();
    expect(r.error).toBeNull();
    rule = r.data!.id;
  }
  const exercise = await a.client
      .from("exercises")
      .select("id")
      .eq("slug", "barbell_bench_press")
      .single(),
    pattern = await a.client
      .from("movement_patterns")
      .select("id")
      .eq("slug", "horizontal_push")
      .single(),
    muscle = await a.client
      .from("muscle_groups")
      .select("id")
      .eq("slug", "pectorals")
      .single();
  const days: { id: string; name: string; position: number }[] = [];
  for (let pos = 1; pos <= n; pos++) {
    const rest = pos % 2 === 0;
    const d = await a.client
      .from("program_days")
      .insert({
        owner_id: a.userId,
        program_id: p.data!.id,
        cycle_length: n,
        cycle_position: pos,
        name: rest ? "Recovery" : `Training ${Math.ceil(pos / 2)}`,
        is_rest_day: rest,
      })
      .select("id")
      .single();
    expect(d.error).toBeNull();
    if (!rest) {
      days.push({
        id: d.data!.id,
        name: `Training ${Math.ceil(pos / 2)}`,
        position: pos,
      });
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
            progression_rule_id: rule,
          })
        ).error,
      ).toBeNull();
    }
  }
  const v = await a.client.rpc("snapshot_program", { p_program: p.data!.id });
  expect(v.error).toBeNull();
  const w = await a.client.rpc("start_program_workout", {
    p_version: v.data,
    p_workout: 1,
    p_request: crypto.randomUUID(),
  });
  expect(w.error).toBeNull();
  return {
    version: v.data as string,
    session: w.data as string,
    days,
    exercise: exercise.data!.id as string,
  };
}
export async function completeSelection(
  a: Account,
  session: string,
  exercise: string,
  reps: number[],
) {
  const m = await a.client
    .from("workout_movements")
    .select("id")
    .eq("workout_session_id", session)
    .order("position")
    .limit(1)
    .single();
  expect(m.error).toBeNull();
  const e = await a.client.rpc("select_program_exercise", {
    p_movement: m.data!.id,
    p_exercise: exercise,
    p_expected: null,
    p_request: crypto.randomUUID(),
  });
  expect(e.error).toBeNull();
  const rows = await a.client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", e.data)
    .order("position");
  expect(rows.error).toBeNull();
  for (const [i, rep] of reps.entries()) {
    expect(
      (
        await a.client.rpc("log_workout_set", {
          p_item: e.data,
          p_id: rows.data![i].id,
          p_revision: rows.data![i].revision,
          p_operation: "save",
          p_mutation: crypto.randomUUID(),
          p_reps: rep,
          p_weight: 50,
          p_type: "working",
          p_completed: true,
        })
      ).error,
    ).toBeNull();
  }
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: session,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  return e.data as string;
}
