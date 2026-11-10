import { test, expect } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import {
  selectionProgram,
  loginSelection,
  completeSelection,
  type Account,
} from "./selection-helpers";
import type { Enrollment } from "../../src/features/programs/enrollment-model";
test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
async function enrollments(a: Account) {
  const r = await a.client.rpc("program_enrollment_history");
  expect(r.error).toBeNull();
  return r.data as Enrollment[];
}
async function command(
  a: Account,
  kind: string,
  assignment: string,
  revision: number,
  version?: string,
  request = crypto.randomUUID(),
) {
  return a.client.rpc("program_lifecycle", {
    p_kind: kind,
    p_request: request,
    p_assignment: assignment,
    p_expected: revision,
    p_version: version ?? null,
    p_start: version ? new Date().toISOString().slice(0, 10) : null,
    p_timezone: version ? "UTC" : null,
  });
}
test("explicit enrollment, statistics, pending end, switch, separate repeats and private paginated history", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 4, 2, false, true, false);
  await loginSelection(page, a);
  await page.goto(`/programs/enroll?version=${p.version}`);
  await expect(
    page.getByRole("heading", { name: "Start Program", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("start-program.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Start Program", exact: true })
    .click();
  await expect(page).toHaveURL(/programs\/current$/);
  let rows = await enrollments(a);
  const first = rows[0].id;
  expect(rows[0].workouts).toBe(0);
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("id")
        .eq("owner_id", a.userId)
    ).data,
  ).toEqual([]);
  await page.locator("#manage-program summary").click();
  await page.screenshot({
    path: info.outputPath("manage-program.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "End After Next Workout", exact: true })
    .click();
  await expect(
    page.getByText(
      "Program will end after your next completed program workout.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .locator("#manage-program")
    .evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.screenshot({
    path: info.outputPath("pending-end.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Cancel Scheduled End", exact: true })
    .click();
  await expect(
    page.getByText(
      "Program will end after your next completed program workout.",
      { exact: true },
    ),
  ).toHaveCount(0);
  // Actual database-recorded training, exact-rep baseline and later improvement.
  for (const kg of [50, 55]) {
    const w = await a.client.rpc("start_program_workout", {
      p_version: p.version,
      p_workout: 1,
      p_request: crypto.randomUUID(),
    });
    expect(w.error).toBeNull();
    await completeSelection(a, w.data as string, p.exercise, [5, 5], kg);
  }
  await page.reload();
  await expect(page.locator(".enrollment-card").first()).toContainText(
    "2 workouts completed",
  );
  await page.screenshot({
    path: info.outputPath("current-program-statistics.png"),
    animations: "disabled",
  });
  const second = await selectionProgram(a, 8, 1, false, true, false);
  await page.goto(`/programs/enroll?version=${second.version}`);
  await expect(
    page.getByRole("heading", { name: "Switch Program", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "historical workouts and progress will be preserved",
  );
  await page
    .getByLabel("Confirm switching programs. My existing history will be kept.")
    .check();
  await page.screenshot({
    path: info.outputPath("switch-program-confirmation.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Switch Program", exact: true })
    .click();
  await expect(page).toHaveURL(/programs\/current$/);
  rows = await enrollments(a);
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.id === first)?.status).toBe("Switched");
  await page.locator("#manage-program summary").click();
  await page
    .getByLabel(
      "Confirm ending this program now. My workouts and progress will be kept.",
    )
    .check();
  await page
    .getByRole("button", { name: "End Program Now", exact: true })
    .click();
  await expect(page).toHaveURL(/history\/programs\/[0-9a-f-]+$/);
  await page.goto(`/programs/enroll?version=${p.version}`);
  await page
    .getByRole("button", { name: "Start Program", exact: true })
    .click();
  await expect(page).toHaveURL(/programs\/current$/);
  rows = await enrollments(a);
  expect(rows).toHaveLength(3);
  expect(rows[0].id).not.toBe(first);
  expect(rows[0].workouts).toBe(0);
  await page.goto("/history");
  await expect(
    page.getByRole("link", { name: "Workouts", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.screenshot({
    path: info.outputPath("history-workouts-selector.png"),
    animations: "disabled",
  });
  await page
    .getByRole("link", { name: "Programs", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/history\/programs$/);
  await expect(page.locator(".enrollment-card")).toHaveCount(3);
  await page.screenshot({
    path: info.outputPath("program-history-repeat-enrollments.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(`/history/programs/${first}`);
  await expect(page.locator("main")).toContainText(
    "Switched to another program",
  );
  await expect(
    page.getByRole("region", { name: "Strength during this enrollment" }),
  ).toContainText("Best Five-Rep Set");
  await page.screenshot({
    path: info.outputPath("program-history-detail.png"),
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [375, 390, 430, 1280])
    for (const colorScheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`program-history-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
    }
  const b = await verifiedAccount();
  expect(
    (await b.client.rpc("program_enrollment_history", { p_assignment: first }))
      .data,
  ).toEqual([]);
});
test("concurrent commands, exact retries, active workout guards and authoritative automatic end", async ({
  page,
}) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 4, 1, false, true, false),
    start = {
      p_kind: "start",
      p_request: crypto.randomUUID(),
      p_version: p.version,
      p_start: new Date().toISOString().slice(0, 10),
      p_timezone: "UTC",
    };
  const duplicate = await Promise.all([
    a.client.rpc("program_lifecycle", start),
    a.client.rpc("program_lifecycle", start),
  ]);
  expect(duplicate.every((r) => !r.error)).toBe(true);
  expect(duplicate[0].data).toEqual(duplicate[1].data);
  const id = duplicate[0].data.assignmentId as string;
  expect((await command(a, "end_after_next", id, 0)).error).toBeNull();
  const w = await a.client.rpc("start_program_workout", {
    p_version: p.version,
    p_workout: 1,
    p_request: crypto.randomUUID(),
  });
  expect(w.error).toBeNull();
  expect((await command(a, "end_now", id, 1)).error).not.toBeNull();
  const q = await selectionProgram(a, 8, 1, false, true, false);
  expect((await command(a, "switch", id, 1, q.version)).error).not.toBeNull();
  await loginSelection(page, a);
  await page.goto("/programs/current");
  await page.locator("#manage-program summary").click();
  await expect(
    page.getByRole("button", { name: "End Program Now", exact: true }),
  ).toBeDisabled();
  await completeSelection(a, w.data as string, p.exercise, [12]);
  expect((await enrollments(a))[0].terminalReason).toBe("ended_after_next");
  expect((await command(a, "cancel_end", id, 1)).error).not.toBeNull();
  // Real simultaneous switch attempts serialize on profile/revision. Exactly one transition wins.
  const fresh = await a.client.rpc("program_lifecycle", {
    ...start,
    p_request: crypto.randomUUID(),
  });
  expect(fresh.error).toBeNull();
  const races = await Promise.all([
    command(a, "switch", fresh.data.assignmentId, 0, q.version),
    command(a, "switch", fresh.data.assignmentId, 0, q.version),
  ]);
  expect(races.filter((r) => !r.error)).toHaveLength(1);
  expect(races.filter((r) => r.error?.code === "40001")).toHaveLength(1);
  expect(
    (
      await a.client
        .from("program_assignments")
        .select("id")
        .eq("state", "active")
        .eq("owner_id", a.userId)
    ).data,
  ).toHaveLength(1);
});
test("cancel and qualifying closure race has one durable result without losing the workout", async () => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 4, 1, false, true, false);
  const start = await a.client.rpc("program_lifecycle", {
    p_kind: "start",
    p_request: crypto.randomUUID(),
    p_version: p.version,
    p_start: new Date().toISOString().slice(0, 10),
    p_timezone: "UTC",
  });
  expect(start.error).toBeNull();
  const id = start.data.assignmentId as string;
  expect((await command(a, "end_after_next", id, 0)).error).toBeNull();
  const w = await a.client.rpc("start_program_workout", {
    p_version: p.version,
    p_workout: 1,
    p_request: crypto.randomUUID(),
  });
  expect(w.error).toBeNull();
  const movement = await a.client
    .from("workout_movements")
    .select("id")
    .eq("workout_session_id", w.data)
    .single();
  const selected = await a.client.rpc("select_program_exercise", {
    p_movement: movement.data!.id,
    p_exercise: p.exercise,
    p_expected: null,
    p_request: crypto.randomUUID(),
  });
  expect(selected.error).toBeNull();
  const sets = await a.client
    .from("workout_sets")
    .select("id,revision")
    .eq("workout_exercise_id", selected.data);
  for (const s of sets.data!) {
    expect(
      (
        await a.client.rpc("log_workout_set", {
          p_item: selected.data,
          p_id: s.id,
          p_revision: s.revision,
          p_operation: "save",
          p_mutation: crypto.randomUUID(),
          p_reps: 12,
          p_weight: 50,
          p_completed: true,
        })
      ).error,
    ).toBeNull();
  }
  const [cancel, close] = await Promise.all([
    command(a, "cancel_end", id, 1),
    a.client.rpc("end_workout", { p_session: w.data, p_outcome: "completed" }),
  ]);
  if (close.error) {
    // Existing continuity intentionally uses NOWAIT. Cancellation can win the
    // profile lock; the ordinary close retry must preserve all saved work.
    expect(close.error.code).toBe("55P03");
    expect(cancel.error).toBeNull();
    expect(
      (
        await a.client.rpc("end_workout", {
          p_session: w.data,
          p_outcome: "completed",
        })
      ).error,
    ).toBeNull();
  }
  const row = (await enrollments(a))[0];
  expect(row.pendingEnd).toBe(false);
  expect(row.workouts).toBe(1);
  expect(row.fullWorkouts).toBe(1);
  if (cancel.error) {
    expect(cancel.error.code).toBe("40001");
    expect(row.terminalReason).toBe("ended_after_next");
  } else {
    expect(row.state).toBe("active");
    expect(row.terminalReason).toBeNull();
  }
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: w.data,
        p_outcome: "completed",
      })
    ).data,
  ).toBe(w.data);
  expect((await enrollments(a))[0].lifecycleRevision).toBe(
    row.lifecycleRevision,
  );
});
