import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { verifiedAccount, localAuth } from "./auth-helpers";
import {
  selectionProgram,
  loginSelection,
  completeSelection,
  type Account,
} from "./selection-helpers";
import { dateOffset } from "../../src/features/scheduling/model";
test.setTimeout(120000);
test.use({ actionTimeout: 10000 });
const widget = (page: Page) =>
  page.getByRole("region", { name: "Your Training Week", exact: true });
const day = (page: Page, date: string) =>
  widget(page).locator(`button:has(time[datetime="${date}"])`);
function localFixture(a: Account, sql: string) {
  localAuth();
  if (!/^[0-9a-f-]{36}$/.test(a.userId)) throw Error("Invalid local owner");
  execFileSync(
    "docker",
    [
      "--host=unix:///var/run/docker.sock",
      "exec",
      "-i",
      "supabase_db_body",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "pipe", "pipe"], env: process.env },
  );
}
async function state(a: Account) {
  const r = await a.client.rpc("program_schedule");
  expect(r.error).toBeNull();
  return r.data;
}
async function decide(
  a: Account,
  kind: string,
  session?: string,
  date?: string,
) {
  const s = await state(a),
    c = s.progress;
  const r = await a.client.rpc("decide_program_schedule", {
    p_assignment: s.assignmentId,
    p_version: s.version,
    p_day: c.dayId,
    p_rotation: c.rotation,
    p_expected: c.workIndex,
    p_revision: c.decisionRevision,
    p_kind: kind,
    p_request: crypto.randomUUID(),
    p_session: session ?? null,
    p_date: date ?? null,
  });
  expect(r.error).toBeNull();
}
test("carried recommendation, seven dates, keyboard, full schedule, historical completion and one-tap identity", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 7, 1);
  await completeSelection(a, p.session, p.exercise, [12]);
  localFixture(
    a,
    `update public.program_assignments set schedule_start_date=current_date-5 where owner_id='${a.userId}' and state='active'; update public.workout_sessions set schedule_due_on=current_date-5,started_at=started_at-interval '5 days',finished_at=finished_at-interval '5 days',last_activity_at=last_activity_at-interval '5 days',activity_evidence_at=activity_evidence_at-interval '5 days',effective_finished_at=effective_finished_at-interval '5 days',created_at=created_at-interval '5 days' where id='${p.session}' and owner_id='${a.userId}'; update public.workout_sets set completed_at=completed_at-interval '5 days',created_at=created_at-interval '5 days' where owner_id='${a.userId}' and workout_exercise_id in(select id from public.workout_exercises where workout_session_id='${p.session}');`,
  );
  const s = await state(a);
  expect(s.next.name).toBe("Training 2");
  expect(s.next.dueOn < s.today).toBe(true);
  await loginSelection(page, a);
  const strip = widget(page).getByRole("group", {
    name: "Seven-day training schedule",
  });
  await expect(strip.locator("button")).toHaveCount(7);
  await expect(widget(page)).toContainText("Carried from");
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
    const boxes = await strip.locator("button").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
    expect(
      boxes.every(
        (b) => b.w >= 44 && b.h >= 44 && b.x >= 0 && b.x + b.w <= width,
      ),
    ).toBe(true);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      if (width === 390 || width === 1440)
        await widget(page).screenshot({
          path: info.outputPath(`dashboard-week-${width}-${colorScheme}.png`),
        });
      if ((width === 390 || width === 1440) && colorScheme === "light")
        await page.screenshot({
          path: info.outputPath(`dashboard-page-${width}.png`),
          fullPage: true,
        });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await day(page, s.today).focus();
  await page.keyboard.press("ArrowRight");
  await expect(day(page, s.today)).toHaveAttribute("aria-current", "date");
  await expect(day(page, dateOffset(s.today, 1))).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    widget(page).getByRole("button", { name: "Start Workout", exact: true }),
  ).toHaveCount(0);
  await widget(page).screenshot({
    path: info.outputPath("dashboard-selected-rest.png"),
  });
  await widget(page)
    .getByRole("link", { name: "Choose a different program workout" })
    .click();
  await expect(page.locator(".program-workout-options")).toHaveAttribute(
    "open",
    "",
  );
  await page.goto(`/dashboard?week=${dateOffset(s.today, -5)}`);
  await day(page, s.next.dueOn).click();
  await expect(widget(page)).toContainText("Not completed · Carried forward");
  await expect(
    widget(page).getByRole("button", { name: "Start Workout", exact: true }),
  ).toHaveCount(0);
  await widget(page).getByRole("link", { name: "View Full Schedule" }).click();
  await expect(page).toHaveURL(/programs\?week=.*#program-calendar$/);
  await page.goto(`/programs?week=${dateOffset(s.today, -5)}`);
  await expect(
    page.getByRole("region", { name: "Program calendar" }),
  ).toContainText("Overdue · carried forward");
  await page.goto(`/dashboard?week=${dateOffset(s.today, -5)}`);
  await day(page, dateOffset(s.today, -5)).click();
  await expect(
    widget(page).getByRole("link", { name: "View Workout", exact: true }),
  ).toHaveAttribute("href", `/history/${p.session}`);
  await widget(page)
    .getByRole("link", { name: "View Workout", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/history/${p.session}$`));
  await page.goto("/workout");
  await expect(
    page.getByRole("region", { name: "Recommended workout" }),
  ).toContainText(s.next.name);
  await page.goto("/dashboard");
  await widget(page)
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  const id = new URL(page.url()).pathname.split("/").pop()!,
    row = await a.client
      .from("workout_sessions")
      .select("program_assignment_id,source_program_day_id,source_rotation")
      .eq("id", id)
      .single();
  expect(row.data).toEqual({
    program_assignment_id: s.assignmentId,
    source_program_day_id: s.next.dayId,
    source_rotation: s.next.rotation,
  });
  await page.goto("/dashboard");
  await expect(
    widget(page).getByRole("link", { name: "Resume Workout", exact: true }),
  ).toHaveAttribute("href", `/workout/${id}`);
  await expect(
    widget(page).getByRole("button", { name: "Start Workout", exact: true }),
  ).toHaveCount(0);
  await widget(page).screenshot({
    path: info.outputPath("dashboard-resume.png"),
  });
});
test("stale decisions and another device's active workout cannot launch the wrong day", async ({
  page,
}) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a);
  await a.client.rpc("end_workout", {
    p_session: p.session,
    p_outcome: "abandoned",
  });
  await loginSelection(page, a);
  await decide(a, "skip");
  await widget(page)
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(widget(page).getByRole("alert")).toContainText(
    "recommendation changed",
  );
  await expect(page).toHaveURL(/dashboard$/);
  await page.reload();
  const s = await state(a);
  const started = await a.client.rpc("start_assigned_workout", {
    p_assignment: s.assignmentId,
    p_version: s.version,
    p_day: s.next.dayId,
    p_expected: s.progress.workIndex,
    p_revision: s.progress.decisionRevision,
    p_request: crypto.randomUUID(),
  });
  expect(started.error).toBeNull();
  await widget(page)
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(widget(page).getByRole("alert")).toContainText("active workout");
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("id")
        .eq("status", "in_progress")
    ).data,
  ).toHaveLength(1);
  await page.reload();
  await expect(
    widget(page).getByRole("link", { name: "Resume Workout", exact: true }),
  ).toHaveAttribute("href", `/workout/${started.data}`);
});
test("partial, accepted partial, skip, defer and independent Favorite all remain accessible on the same date", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 3, 2);
  await completeSelection(a, p.session, p.exercise, [8]);
  await decide(a, "accept_partial", p.session);
  await decide(a, "skip");
  const before = await state(a);
  await decide(a, "defer", undefined, dateOffset(before.today, 3));
  const saved = await a.client.rpc("save_favorite_workout", {
    p_type: "program_day",
    p_source: p.version,
    p_day: p.days[0].id,
    p_name: "Independent press",
    p_request: crypto.randomUUID(),
  });
  expect(saved.error).toBeNull();
  const w = await a.client.rpc("start_favorite_workout", {
    p_favorite: saved.data,
    p_request: crypto.randomUUID(),
  });
  expect(w.error).toBeNull();
  const index = (await state(a)).progress.workIndex;
  await completeSelection(a, w.data, p.exercise, [8]);
  expect((await state(a)).progress.workIndex).toBe(index);
  await loginSelection(page, a);
  await expect(widget(page)).toContainText("Partial training recorded");
  await expect(widget(page)).toContainText(
    "Partial accepted · scheduling only",
  );
  await expect(widget(page)).toContainText("Skipped");
  await expect(widget(page)).toContainText("Deferred");
  await expect(widget(page)).toContainText("Independent training");
  await expect(day(page, before.today).locator("small")).toHaveText(/^\+\d+/);
  const hrefs = await widget(page)
    .getByRole("link", { name: "View Workout", exact: true })
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
  expect(hrefs).toContain(`/history/${w.data}`);
  expect(hrefs).toContain(`/history/${p.session}`);
  const detail = widget(page).getByRole("region", {
    name: `Training on ${before.today}`,
  });
  await detail.focus();
  await expect(detail).toBeFocused();
  await page.keyboard.press("End");
  await expect(detail).toContainText("Deferred");
  await page.setViewportSize({ width: 390, height: 1000 });
  await widget(page).screenshot({
    path: info.outputPath("dashboard-multiple-events.png"),
  });
});
test("empty and unconfigured states stay honest, completed assignments have no future start", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  await expect(widget(page).getByRole("group")).toHaveCount(0);
  await expect(
    widget(page).getByRole("link", { name: "Browse Programs" }),
  ).toBeVisible();
  await expect(
    widget(page).getByRole("link", { name: "Start Other Workout" }),
  ).toHaveAttribute("href", "/workout/new");
  await widget(page).screenshot({
    path: info.outputPath("dashboard-empty.png"),
  });
  const p = await selectionProgram(a, 3, 1, false, false);
  await a.client.rpc("end_workout", {
    p_session: p.session,
    p_outcome: "abandoned",
  });
  await page.reload();
  await expect(widget(page)).toContainText("start date and timezone");
  await expect(
    widget(page).getByRole("link", { name: "Configure Calendar" }),
  ).toBeVisible();
  expect((await state(a)).configured).toBe(false);
  await widget(page).screenshot({
    path: info.outputPath("dashboard-unconfigured.png"),
  });
  await widget(page).getByRole("link", { name: "Configure Calendar" }).click();
  const calendar = page.getByRole("region", { name: "Program calendar" });
  await calendar.getByLabel("Scheduling timezone", { exact: true }).fill("UTC");
  await calendar.getByLabel("Use this timezone for scheduling").check();
  await calendar
    .getByRole("button", { name: "Initialize schedule", exact: true })
    .click();
  await expect(calendar.locator(".schedule-week > li")).toHaveCount(7);
  for (let rotation = 0; rotation < 2; rotation++)
    for (const position of [1, 3]) {
      const w = await a.client.rpc("start_program_workout", {
        p_version: p.version,
        p_workout: position,
        p_request: crypto.randomUUID(),
      });
      expect(w.error).toBeNull();
      await completeSelection(a, w.data, p.exercise, [12]);
    }
  const completed = await state(a);
  expect(completed.programComplete).toBe(true);
  expect(completed.next).toBeNull();
  await page.goto("/dashboard");
  await expect(widget(page)).toContainText("Program complete");
  await expect(
    widget(page).getByRole("button", { name: "Start Workout", exact: true }),
  ).toHaveCount(0);
  const replacement = await selectionProgram(a, 4, 1);
  await a.client.rpc("end_workout", {
    p_session: replacement.session,
    p_outcome: "abandoned",
  });
  const archived = await a.client.rpc("program_schedule", {
    p_assignment: completed.assignmentId,
  });
  expect(archived.data.state).toBe("archived");
  expect(archived.data.next).toBeNull();
  expect((await state(a)).assignmentId).not.toBe(completed.assignmentId);
  await page.reload();
  await expect(
    widget(page).getByRole("button", { name: "Start Workout", exact: true }),
  ).toBeVisible();
});
test("fixed assignment timezone and nonweekly calendar survive year boundaries and browser history", async ({
  page,
}) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 8, 1);
  await a.client.rpc("end_workout", {
    p_session: p.session,
    p_outcome: "abandoned",
  });
  localFixture(
    a,
    `update public.program_assignments set schedule_timezone='Pacific/Auckland',schedule_start_date=(clock_timestamp() at time zone 'Pacific/Auckland')::date where owner_id='${a.userId}' and state='active';`,
  );
  const s = await state(a);
  await loginSelection(page, a);
  await expect(day(page, s.today)).toHaveAttribute("aria-current", "date");
  await expect(widget(page)).toContainText("Pacific/Auckland");
  await page.goto("/dashboard?week=2026-12-31");
  await expect(widget(page).locator("time")).toHaveCount(7);
  const times = await widget(page)
    .locator("time")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("datetime")));
  expect(times).toEqual([
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
  await expect(
    widget(page).getByRole("button", { name: "Start Workout", exact: true }),
  ).toHaveCount(0);
  await widget(page).getByRole("link", { name: "Next training week" }).click();
  await expect(page).toHaveURL(/week=2027-01-04/);
  await page.goBack();
  await expect(widget(page).locator("time").first()).toHaveAttribute(
    "datetime",
    "2026-12-28",
  );
});
