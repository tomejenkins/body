import { test, expect, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import {
  loginSelection,
  selectionProgram,
  completeSelection,
  type Account,
} from "./selection-helpers";
test.setTimeout(120000);
test.use({ actionTimeout: 12000 });
async function adHoc(a: Account, name: string, kg: number) {
  const ex = await a.client
    .from("exercises")
    .select("id")
    .eq("slug", "barbell_bench_press")
    .single();
  const w = await a.client.rpc("start_ad_hoc_workout");
  expect(w.error).toBeNull();
  expect(
    (await a.client.from("workout_sessions").update({ name }).eq("id", w.data))
      .error,
  ).toBeNull();
  const e = await a.client.rpc("edit_workout", {
    p_session: w.data,
    p_operation: "add",
    p_exercise: ex.data!.id,
  });
  expect(e.error).toBeNull();
  const sets = await a.client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", e.data);
  for (const s of sets.data!)
    expect(
      (
        await a.client.rpc("log_workout_set", {
          p_item: e.data,
          p_id: s.id,
          p_revision: s.revision,
          p_operation: "save",
          p_mutation: crypto.randomUUID(),
          p_reps: 5,
          p_weight: kg,
          p_completed: true,
        })
      ).error,
    ).toBeNull();
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: w.data,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  return {
    id: w.data as string,
    exercise: ex.data!.id as string,
    item: e.data as string,
  };
}
async function confirm(page: Page, kind: "archive" | "restore" | "delete") {
  const section = page.getByRole("region", { name: "Manage Workout" });
  await section
    .getByRole("button", {
      name:
        kind === "archive"
          ? "Archive Workout"
          : kind === "restore"
            ? "Restore Workout"
            : "Delete Workout",
      exact: true,
    })
    .click();
  await section.getByRole("checkbox").check();
  await section
    .getByRole("button", {
      name:
        kind === "archive"
          ? "Confirm Archive"
          : kind === "restore"
            ? "Restore Workout"
            : "Delete Permanently",
      exact: true,
    })
    .click();
  if (kind === "archive")
    await expect(
      page.getByText("Archived Workout", { exact: true }),
    ).toBeVisible();
  else if (kind === "restore")
    await expect(
      page.getByText("Archived Workout", { exact: true }),
    ).toHaveCount(0);
  else await expect(page).toHaveURL(/history\?message=deleted$/);
}
async function best(a: Account, exercise: string) {
  const r = await a.client.rpc("record_metrics", { p_exercise: exercise });
  expect(r.error).toBeNull();
  return Math.max(
    0,
    ...r.data
      .filter(
        (x: { metric: string; load_key: number }) =>
          x.metric === "actual_rm" && x.load_key === 5,
      )
      .map((x: { value: number }) => Number(x.value)),
  );
}
test("archive, original archived detail, restore and permanent deletion reconcile records and preserve Favorite structure", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    baseline = await adHoc(a, "Retention baseline", 50),
    peak = await adHoc(a, "Retention peak", 100);
  const favorite = await a.client.rpc("save_favorite_workout", {
    p_type: "completed_ad_hoc",
    p_source: peak.id,
    p_day: null,
    p_name: "Reusable bench",
    p_request: crypto.randomUUID(),
  });
  expect(favorite.error).toBeNull();
  expect(await best(a, peak.exercise)).toBe(100);
  await loginSelection(page, a);
  await page.goto(`/history/${peak.id}`);
  const manage = page.getByRole("region", { name: "Manage Workout" });
  await manage.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("history-management.png"),
    fullPage: true,
  });
  await manage
    .getByRole("button", { name: "Archive Workout", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("archive-confirmation.png"),
    fullPage: true,
  });
  await manage.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("archived_at")
        .eq("id", peak.id)
        .single()
    ).data!.archived_at,
  ).toBeNull();
  await confirm(page, "archive");
  await expect(
    page.getByText("Archived Workout", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Workout Summary", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("archived-workout-detail.png"),
    fullPage: true,
  });
  expect(await best(a, peak.exercise)).toBe(50);
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("actual_weight_kg")
        .eq("workout_exercise_id", peak.item)
    ).data!.every((s) => Number(s.actual_weight_kg) === 100),
  ).toBe(true);
  await page.goto("/history");
  await expect(page.locator(".history-list")).toContainText(
    "Retention baseline",
  );
  await expect(page.locator(".history-list")).not.toContainText(
    "Retention peak",
  );
  await page
    .getByRole("link", { name: "Archived Workouts →", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Archived Workouts", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".history-list > li")).toHaveCount(1);
  await expect(page.locator(".history-list")).toContainText("Archived");
  await page.screenshot({
    path: info.outputPath("archived-history.png"),
    fullPage: true,
  });
  await page.locator(".history-list a").first().click();
  await confirm(page, "restore");
  await expect(page.getByText("Archived Workout", { exact: true })).toHaveCount(
    0,
  );
  expect(await best(a, peak.exercise)).toBe(100);
  await page.screenshot({
    path: info.outputPath("restored-workout.png"),
    fullPage: true,
  });
  await manage
    .getByRole("button", { name: "Delete Workout", exact: true })
    .click();
  await expect(
    manage.getByRole("button", { name: "Delete Permanently", exact: true }),
  ).toHaveClass(/bg-destructive/);
  await page.screenshot({
    path: info.outputPath("permanent-delete-confirmation.png"),
    fullPage: true,
  });
  await manage.getByRole("checkbox").check();
  await manage
    .getByRole("button", { name: "Delete Permanently", exact: true })
    .click();
  await expect(page).toHaveURL(/history\?message=deleted$/);
  expect(await best(a, peak.exercise)).toBe(50);
  expect(
    (await a.client.from("workout_sessions").select("id").eq("id", peak.id))
      .data,
  ).toEqual([]);
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("id")
        .eq("workout_exercise_id", peak.item)
    ).data,
  ).toEqual([]);
  const source = await a.client
    .from("favorite_workouts")
    .select("source_session_id,definition")
    .eq("id", favorite.data)
    .single();
  expect(source.data!.source_session_id).toBeNull();
  expect(source.data!.definition).toHaveLength(1);
  const launch = await a.client.rpc("start_favorite_workout", {
    p_favorite: favorite.data,
    p_request: crypto.randomUUID(),
  });
  expect(launch.error).toBeNull();
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("program_assignment_id")
        .eq("id", launch.data)
        .single()
    ).data!.program_assignment_id,
  ).toBeNull();
  await a.client.rpc("end_workout", {
    p_session: launch.data,
    p_outcome: "abandoned",
  });
  await page.goto(`/history/${peak.id}`);
  await expect(
    page.getByRole("heading", { name: /could not be found|not found/i }),
  ).toBeVisible();
  expect(baseline.id).not.toBe(peak.id);
});
test("program triggering evidence can be archived/restored/deleted without replaying its historical ending", async ({
  page,
}) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 8, 2),
    schedule = await a.client.rpc("program_schedule");
  expect(schedule.error).toBeNull();
  const id = schedule.data.assignmentId as string;
  expect(
    (
      await a.client.rpc("program_lifecycle", {
        p_kind: "end_after_next",
        p_request: crypto.randomUUID(),
        p_assignment: id,
        p_expected: 0,
      })
    ).error,
  ).toBeNull();
  await completeSelection(a, p.session, p.exercise, [12, 12]);
  const before = await a.client
    .from("program_assignments")
    .select("terminal_reason,ended_at,lifecycle_revision")
    .eq("id", id)
    .single();
  expect(before.data!.terminal_reason).toBe("ended_after_next");
  await loginSelection(page, a);
  await page.goto(`/history/${p.session}`);
  await confirm(page, "archive");
  await page.goto(`/history/programs/${id}`);
  await expect(page.locator("main")).toContainText(
    "Current retained training history is incomplete",
  );
  expect(
    (await a.client.rpc("program_enrollment_history", { p_assignment: id }))
      .data[0].workouts,
  ).toBe(0);
  await page.goto(`/history/${p.session}`);
  await confirm(page, "restore");
  expect(
    (await a.client.rpc("program_enrollment_history", { p_assignment: id }))
      .data[0].workouts,
  ).toBe(1);
  await confirm(page, "delete");
  const after = await a.client
    .from("program_assignments")
    .select(
      "terminal_reason,ended_at,lifecycle_revision,terminal_session_id,state",
    )
    .eq("id", id)
    .single();
  expect(after.data!.terminal_reason).toBe(before.data!.terminal_reason);
  expect(after.data!.ended_at).toBe(before.data!.ended_at);
  expect(after.data!.lifecycle_revision).toBe(before.data!.lifecycle_revision);
  expect(after.data!.terminal_session_id).toBeNull();
  expect(after.data!.state).toBe("archived");
});
test("retention races and exact-request retries preserve one atomic outcome and owner privacy", async () => {
  const a = await verifiedAccount(),
    w = await adHoc(a, "Concurrent retention", 75),
    request = crypto.randomUUID(),
    args = {
      p_session: w.id,
      p_kind: "archive",
      p_request: request,
      p_expected: 0,
    };
  const duplicate = await Promise.all([
    a.client.rpc("retain_workout", args),
    a.client.rpc("retain_workout", args),
  ]);
  expect(duplicate.every((r) => !r.error)).toBe(true);
  expect(duplicate[0].data).toEqual(duplicate[1].data);
  const b = await verifiedAccount();
  expect(
    (
      await b.client.rpc("retain_workout", {
        ...args,
        p_request: crypto.randomUUID(),
      })
    ).error?.code,
  ).toBe("42501");
  expect(
    (await b.client.from("workout_retention_receipts").select("id")).data,
  ).toEqual([]);
  const races = await Promise.all([
    a.client.rpc("retain_workout", {
      ...args,
      p_kind: "restore",
      p_request: crypto.randomUUID(),
      p_expected: 1,
    }),
    a.client.rpc("retain_workout", {
      ...args,
      p_kind: "delete",
      p_request: crypto.randomUUID(),
      p_expected: 1,
    }),
  ]);
  expect(races.filter((r) => !r.error)).toHaveLength(1);
  expect(
    races.filter((r) => r.error && ["40001", "42501"].includes(r.error.code)),
  ).toHaveLength(1);
  const row = await a.client
    .from("workout_sessions")
    .select("retention_revision")
    .eq("id", w.id)
    .maybeSingle();
  if (row.data) {
    const deletion = {
      ...args,
      p_kind: "delete",
      p_request: crypto.randomUUID(),
      p_expected: row.data.retention_revision,
    };
    const results = await Promise.all([
      a.client.rpc("retain_workout", deletion),
      a.client.rpc("retain_workout", deletion),
    ]);
    expect(results.every((r) => !r.error)).toBe(true);
    expect(results[0].data).toEqual(results[1].data);
    expect(
      (await a.client.rpc("retain_workout", { ...deletion, p_kind: "restore" }))
        .error?.code,
    ).toBe("23514");
  }
  expect(
    (await a.client.from("workout_sessions").select("id").eq("id", w.id)).data,
  ).toEqual([]);
  const otherWorkout = await adHoc(a, "Archive delete race", 80);
  const archiveDelete = await Promise.all(
    ["archive", "delete"].map((kind) =>
      a.client.rpc("retain_workout", {
        p_session: otherWorkout.id,
        p_kind: kind,
        p_request: crypto.randomUUID(),
        p_expected: 0,
      }),
    ),
  );
  expect(archiveDelete.filter((r) => !r.error)).toHaveLength(1);
  expect(archiveDelete.filter((r) => r.error)).toHaveLength(1);
  const surviving = await a.client
    .from("workout_sessions")
    .select("retention_revision,archived_at")
    .eq("id", otherWorkout.id)
    .maybeSingle();
  if (surviving.data) {
    expect(surviving.data.archived_at).toBeTruthy();
    expect(surviving.data.retention_revision).toBe(1);
    expect(
      (
        await a.client.rpc("retain_workout", {
          p_session: otherWorkout.id,
          p_kind: "delete",
          p_request: crypto.randomUUID(),
          p_expected: 1,
        })
      ).error,
    ).toBeNull();
  }
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("id")
        .eq("workout_exercise_id", otherWorkout.item)
    ).data,
  ).toEqual([]);
});
