import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { verifiedAccount, localAuth } from "./auth-helpers";
import {
  selectionProgram,
  loginSelection,
  type Account,
} from "./selection-helpers";
import { openWorkoutEnding } from "./workout-screen-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(120000);
test.use({ actionTimeout: 10000 });
const exercise = (slug: string) =>
  catalog.exercises.find((e) => e.slug === slug)!.id;
async function log(
  a: Account,
  item: string,
  position: number,
  reps: number,
  weight = 50,
  type = "working",
) {
  const z = (
    await a.client
      .from("workout_sets")
      .select("id,revision")
      .eq("workout_exercise_id", item)
      .eq("position", position)
      .single()
  ).data!;
  expect(
    (
      await a.client.rpc("log_workout_set", {
        p_item: item,
        p_id: z.id,
        p_revision: z.revision,
        p_operation: "save",
        p_mutation: crypto.randomUUID(),
        p_reps: reps,
        p_weight: weight,
        p_type: type,
        p_completed: true,
      })
    ).error,
  ).toBeNull();
  return z.id;
}
async function programItem(a: Account, w: string, id: string) {
  const m = (
    await a.client
      .from("workout_movements")
      .select("id")
      .eq("workout_session_id", w)
      .order("position")
      .limit(1)
      .single()
  ).data!;
  const e = await a.client.rpc("select_program_exercise", {
    p_movement: m.id,
    p_exercise: id,
    p_expected: null,
    p_request: crypto.randomUUID(),
  });
  expect(e.error).toBeNull();
  return e.data as string;
}
async function finish(page: Page, partial = true) {
  await openWorkoutEnding(page);
  if (partial)
    await page
      .getByRole("dialog", { name: "End workout?" })
      .getByRole("checkbox", { name: /Finish without completing/ })
      .check();
  await page
    .getByRole("dialog", { name: "End workout?" })
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}\/complete$/);
  await expect(
    page.getByRole("heading", { name: "Workout Complete!", exact: true }),
  ).toBeVisible();
}
function localFixture(a: Account, sql: string) {
  localAuth();
  if (!/^[0-9a-f-]{36}$/.test(a.userId)) throw Error("Invalid synthetic owner");
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
const completion = (page: Page) => page.locator(".workout-completion");
async function savedEvidence(a: Account) {
  const [sessions, sets, receipts] = await Promise.all([
    a.client
      .from("workout_sessions")
      .select("id,status,completion_status,finished_at,updated_at")
      .order("id"),
    a.client
      .from("workout_sets")
      .select("id,status,actual_reps,actual_weight_kg,updated_at")
      .order("id"),
    a.client.from("program_lifecycle_receipts").select("id").order("id"),
  ]);
  for (const result of [sessions, sets, receipts])
    expect(result.error).toBeNull();
  return { sessions: sessions.data, sets: sets.data, receipts: receipts.data };
}

test("ad-hoc finish shows qualifying facts, saves one Favorite, refreshes safely and Done returns to fresh Dashboard", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  const w = await a.client.rpc("start_exercise_workout", {
    p_exercises: [
      exercise("barbell_bench_press"),
      exercise("seated_cable_row"),
    ],
    p_request: crypto.randomUUID(),
  });
  expect(w.error).toBeNull();
  const items = (
    await a.client
      .from("workout_exercises")
      .select("id")
      .eq("workout_session_id", w.data)
      .order("position")
  ).data!;
  await log(a, items[0].id, 1, 8);
  await log(a, items[0].id, 2, 8, 20, "warm_up");
  await log(a, items[0].id, 3, 0);
  await log(a, items[1].id, 1, 8);
  await loginSelection(page, a);
  await page.goto(`/workout/${w.data}`);
  await finish(page);
  await expect(
    page.getByRole("navigation", { name: "Main navigation", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workout-mode-bar")).toHaveCount(0);
  const metrics = completion(page).locator(".completion-statistics");
  await expect(metrics.locator("dd")).toHaveCount(3);
  await expect(metrics.locator("dd").nth(1)).toHaveText("2");
  await expect(metrics.locator("dd").nth(2)).toHaveText("2");
  await expect(completion(page)).toContainText("Another session in the books.");
  await expect(page.locator(".achievement-card")).toHaveCount(0);
  const before = (
    await a.client
      .from("workout_sets")
      .select("id,status,actual_reps,actual_weight_kg")
      .order("id")
  ).data;
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /feed|publish/i.test(r.url()))
      posts.push(r.url());
  });
  const share = completion(page).getByRole("button", {
    name: "Share to Feed · Coming Later",
    exact: true,
  });
  await expect(share).toBeDisabled();
  await share.evaluate((e: HTMLButtonElement) => e.click());
  expect(posts).toEqual([]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(completion(page).locator(".completion-success-check")).toHaveCSS(
    "animation-name",
    "completion-check",
  );
  await expect(completion(page).locator(".completion-success-check")).toHaveCSS(
    "animation-iteration-count",
    "1",
  );
  expect(
    await completion(page)
      .locator(".completion-success")
      .evaluate((el) => getComputedStyle(el, "::after").animationName),
  ).toBe("completion-halo");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(completion(page).locator(".completion-success-check")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(completion(page).locator(".completion-success-check")).toHaveCSS(
    "stroke-dashoffset",
    "0px",
  );
  expect(
    await completion(page)
      .locator(".completion-success")
      .evaluate((el) => getComputedStyle(el, "::after").animationName),
  ).toBe("none");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("complete-ad-hoc-no-pr.png"),
    fullPage: true,
  });
  await completion(page).locator(".save-favorite > summary").click();
  await page.getByLabel("Favorite name").fill("Press and row");
  await page
    .getByRole("button", { name: "Save Favorite", exact: true })
    .click();
  await expect(completion(page).getByRole("status")).toContainText(
    "Saved as Favorite",
  );
  await page.reload();
  await expect(completion(page)).toContainText(
    "Saved as Favorite · Press and row",
  );
  expect(
    (await a.client.from("favorite_workouts").select("id")).data,
  ).toHaveLength(1);
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("id,status,actual_reps,actual_weight_kg")
        .order("id")
    ).data,
  ).toEqual(before);
  await page.screenshot({
    path: info.outputPath("complete-favorite-saved.png"),
    fullPage: true,
  });
  await completion(page)
    .getByRole("link", { name: "View Full Workout", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/history/${w.data}$`));
  await expect(page.locator(".qualifying-training-summary")).toHaveText(
    "2 qualifying working sets · 2 exercises performed",
  );
  await page.goto(`/workout?message=completed&finished=${w.data}`);
  await expect(page).toHaveURL(new RegExp(`/workout/${w.data}/complete$`));
  const done = completion(page).getByRole("link", {
    name: "Done",
    exact: true,
  });
  await done.focus();
  await page.keyboard.press("Tab");
  await expect(
    completion(page).getByRole("link", {
      name: "View Full Workout",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(done).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/dashboard$/);
  await expect(page.locator(".home-recent")).toContainText("2 working sets");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Workout Complete!" }),
  ).toBeVisible();
  expect(
    (await a.client.from("workout_sessions").select("status")).data,
  ).toEqual([{ status: "completed" }]);
});
test("program completion and partial summary reuse outcomes/progression while Favorite save and revisit do not accept partial training", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 4, 3, true),
    item = await programItem(a, p.session, p.exercise);
  for (let n = 1; n <= 3; n++) await log(a, item, n, 12);
  await loginSelection(page, a);
  await page.goto(`/workout/${p.session}`);
  await finish(page, false);
  await expect(
    completion(page).getByRole("region", { name: "Program workout summary" }),
  ).toContainText("1/1 movements complete · 3/3 prescribed sets completed");
  await expect(page.getByRole("region", { name: "Next time" })).toContainText(
    "Consider a small load increase",
  );
  await page.screenshot({
    path: info.outputPath("complete-program.png"),
    fullPage: true,
  });
  await completion(page)
    .getByRole("region", { name: "Program workout summary" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("complete-program-progress.png"),
  });
  const w = await a.client.rpc("start_program_workout", {
    p_version: p.version,
    p_workout: 3,
    p_request: crypto.randomUUID(),
  });
  expect(w.error).toBeNull();
  const e = await programItem(a, w.data, p.exercise);
  await log(a, e, 1, 8);
  await page.goto(`/workout/${w.data}`);
  await finish(page);
  await expect(completion(page)).toContainText("Partial Workout");
  await expect(completion(page)).toContainText(
    "0/1 movements complete · 1/3 prescribed sets completed",
  );
  const cursor = (await a.client.rpc("program_schedule")).data.progress;
  await page.reload();
  expect((await a.client.rpc("program_schedule")).data.progress).toEqual(
    cursor,
  );
  await expect(completion(page)).toContainText("Partial Workout");
  await expect(completion(page)).toContainText(
    "0/1 movements complete · 1/3 prescribed sets completed",
  );
  await page.screenshot({
    path: info.outputPath("complete-partial.png"),
    fullPage: true,
  });
  await completion(page)
    .getByRole("region", { name: "Program workout summary" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("complete-partial-progress.png"),
  });
  await completion(page).locator(".completion-next summary").click();
  await expect(
    completion(page).locator(".completion-next details"),
  ).toHaveAttribute("open", "");

  await completion(page).locator(".save-favorite > summary").click();
  await page
    .getByRole("button", { name: "Save Favorite", exact: true })
    .click();
  await expect(completion(page)).toContainText("Saved as Favorite");
  expect((await a.client.rpc("program_schedule")).data.progress).toEqual(
    cursor,
  );
  await completion(page)
    .getByRole("link", { name: "Review program schedule" })
    .click();
  await expect(page.locator(".schedule-decisions")).toHaveAttribute("open", "");
  await expect(
    page.getByRole("button", {
      name: "Accept Partial & Continue",
      exact: true,
    }),
  ).toBeVisible();
  expect((await a.client.rpc("program_schedule")).data.progress).toEqual(
    cursor,
  );
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("completion_status")
        .eq("id", w.data)
        .single()
    ).data!.completion_status,
  ).toBe("partial");
});
test("three diverse new records and additional exact/estimated/volume achievements are private and stable", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    ids = [
      exercise("barbell_bench_press"),
      exercise("barbell_back_squat"),
      exercise("seated_cable_row"),
    ];
  async function session(weight: number, baseline = false) {
    const w = await a.client.rpc("start_exercise_workout", {
      p_exercises: ids,
      p_request: crypto.randomUUID(),
    });
    expect(w.error).toBeNull();
    const rows = (
      await a.client
        .from("workout_exercises")
        .select("id")
        .eq("workout_session_id", w.data)
        .order("position")
    ).data!;
    for (const [i, e] of rows.entries()) {
      await log(a, e.id, 1, 5, weight);
      if (baseline && i === 0) await log(a, e.id, 2, 3, weight);
    }
    return w.data as string;
  }
  const prior = await session(50, true);
  await a.client.rpc("end_workout", {
    p_session: prior,
    p_outcome: "completed",
  });
  const w = await session(60);
  await a.client
    .from("workout_sessions")
    .update({
      name: "Full Body strength practice — presses, squats and rows with deliberate, well-recorded working sets",
    })
    .eq("id", w);
  await loginSelection(page, a);
  await page.goto(`/workout/${w}`);
  await finish(page);
  await expect(page.locator(".achievement-card")).toHaveCount(3);
  const achievements = (
    await a.client.rpc("workout_achievements", { p_session: w })
  ).data;
  expect(
    achievements.some(
      (r: { metric: string; load_key: number }) =>
        r.metric === "actual_rm" && r.load_key === 3,
    ),
  ).toBe(false);
  expect(
    achievements.some(
      (r: { metric: string; load_key: number }) =>
        r.metric === "actual_rm" && r.load_key === 5,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    // Stress an unbroken exercise title without changing catalog or saved facts.
    const title = page.locator(".achievement-card h3").first();
    const originalTitle = await title.textContent();
    await title.evaluate((el) => {
      el.textContent = "LongExerciseName".repeat(12);
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await title.evaluate((el, value) => {
      el.textContent = value;
    }, originalTitle);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const boxes = await completion(page)
      .locator(".completion-statistics > div")
      .evaluateAll((nodes) => nodes.map((e) => e.getBoundingClientRect().y));
    expect(new Set(boxes).size).toBe(1);
    for (const target of await completion(page)
      .locator(
        ".completion-actions a, .completion-more > a, .completion-favorite summary",
      )
      .all()) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.screenshot({
        path: info.outputPath(`complete-prs-${width}-${colorScheme}.png`),
        fullPage: true,
      });
    }
  }
  // Browser text-size stress without changing recorded facts or zooming the screenshot.
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const fullWorkoutLink = completion(page).getByRole("link", {
    name: "View Full Workout",
    exact: true,
  });
  await fullWorkoutLink.scrollIntoViewIfNeeded();
  const linkBox = await fullWorkoutLink.boundingBox(),
    navigationBox = await page.locator(".desktop-sidebar").boundingBox();
  expect(linkBox!.y + linkBox!.height).toBeLessThanOrEqual(navigationBox!.y);
  await page.screenshot({
    path: info.outputPath("complete-large-text.png"),
    fullPage: true,
  });
  await page.reload();
  const top = await page.locator(".achievement-card h3").allTextContents();
  await page.reload();
  await expect(page.locator(".achievement-card h3")).toHaveText(top);
  await completion(page)
    .getByRole("link", { name: /View All Achievements/ })
    .click();
  await expect(completion(page)).toContainText("Best Five-Rep Set");
  await expect(completion(page)).toContainText("Estimated 1RM");
  await expect(completion(page)).toContainText("Best Session Volume");
  await expect(completion(page)).not.toContainText("Best Triple");
  await page.screenshot({
    path: info.outputPath("complete-additional-achievements.png"),
    fullPage: true,
  });
  expect(
    (await a.client.rpc("workout_achievements", { p_session: w })).data,
  ).toEqual(achievements);
});
test("effective paused duration, Favorite capacity and active/abandoned/foreign/missing access follow existing policy", async ({
  page,
  browser,
}) => {
  const a = await verifiedAccount(),
    w = await a.client.rpc("start_exercise_workout", {
      p_exercises: [exercise("barbell_bench_press")],
      p_request: crypto.randomUUID(),
    });
  expect(w.error).toBeNull();
  const item = (
    await a.client
      .from("workout_exercises")
      .select("id")
      .eq("workout_session_id", w.data)
      .single()
  ).data!;
  await log(a, item.id, 1, 8);
  localFixture(
    a,
    `update public.workout_sessions set started_at=clock_timestamp()-interval '20 minutes',manual_pause_intervals=jsonb_build_array(jsonb_build_object('from',clock_timestamp()-interval '15 minutes','to',clock_timestamp()-interval '10 minutes')) where owner_id='${a.userId}' and id='${w.data}';`,
  );
  await loginSelection(page, a);
  await page.goto(`/workout/${w.data}/complete`);
  await expect(page).toHaveURL(new RegExp(`/workout/${w.data}$`));
  await finish(page);
  await expect(
    completion(page).locator(".completion-statistics dd").first(),
  ).toHaveText("15 min");
  await expect(completion(page)).toContainText("Excludes pauses");
  localFixture(
    a,
    `insert into public.favorite_workouts(owner_id,name,source_type,source_key,definition,attribution,save_request) select '${a.userId}','Capacity '||i,'completed_ad_hoc','capacity_'||i,'[{}]'::jsonb,'{}'::jsonb,gen_random_uuid() from generate_series(1,100)i;`,
  );
  await page.reload();
  await expect(completion(page)).toContainText("Your Favorites is full (100)");
  await expect(
    completion(page).getByRole("button", {
      name: "Save Favorite",
      exact: true,
    }),
  ).toHaveCount(0);
  const foreign = await verifiedAccount(),
    f = await foreign.client.rpc("start_ad_hoc_workout");
  await foreign.client.rpc("end_workout", {
    p_session: f.data,
    p_outcome: "completed",
  });
  const denied = await page.goto(`/workout/${f.data}/complete`);
  expect([200, 404]).toContain(denied?.status());
  await expect(
    page.getByRole("heading", { name: "404", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workout Complete!" }),
  ).toHaveCount(0);
  await page.goto("/workout/00000000-0000-0000-0000-000000000000/complete");
  await expect(
    page.getByRole("heading", { name: "404", exact: true }),
  ).toBeVisible();
  await page.goto("/workout/not-a-uuid/complete");
  await expect(
    page.getByRole("heading", { name: "404", exact: true }),
  ).toBeVisible();
  const abandoned = await a.client.rpc("start_ad_hoc_workout");
  await a.client.rpc("end_workout", {
    p_session: abandoned.data,
    p_outcome: "abandoned",
  });
  await page.goto(`/workout/${abandoned.data}/complete`);
  await expect(page).toHaveURL(new RegExp(`/history/${abandoned.data}$`));
  await expect(
    page.getByRole("heading", { name: "Workout Complete!" }),
  ).toHaveCount(0);
  const context = await browser.newContext(),
    anonymous = await context.newPage();
  await anonymous.goto(`http://127.0.0.1:3000/workout/${w.data}/complete`);
  await expect(anonymous).toHaveURL(/login\?next=/);
  await context.close();
});

test("one real bodyweight record, empty training, retained access and motion stay truthful", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  async function bodyweight(reps: number) {
    const w = await a.client.rpc("start_exercise_workout", {
      p_exercises: [exercise("push_up")],
      p_request: crypto.randomUUID(),
    });
    expect(w.error).toBeNull();
    const item = (
      await a.client
        .from("workout_exercises")
        .select("id")
        .eq("workout_session_id", w.data)
        .single()
    ).data!;
    const row = (
      await a.client
        .from("workout_sets")
        .select("id,revision")
        .eq("workout_exercise_id", item.id)
        .order("position")
        .limit(1)
        .single()
    ).data!;
    expect(
      (
        await a.client.rpc("log_workout_set", {
          p_item: item.id,
          p_id: row.id,
          p_revision: row.revision,
          p_operation: "save",
          p_mutation: crypto.randomUUID(),
          p_reps: reps,
          p_weight: null,
          p_mode: "bodyweight",
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
    return w.data as string;
  }
  await bodyweight(10);
  const id = await bodyweight(12);
  await loginSelection(page, a);
  const evidenceBefore = await savedEvidence(a);
  await page.goto(`/workout/${id}/complete`);
  await expect(page.locator(".achievement-card")).toHaveCount(1);
  await expect(page.locator(".achievement-card")).toContainText(
    "Most Bodyweight Reps",
  );
  await expect(page.locator(".achievement-card strong")).toHaveText("12 reps");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.screenshot({
    path: info.outputPath("complete-one-pr.png"),
    fullPage: true,
  });
  await page.reload();
  expect(await savedEvidence(a)).toEqual(evidenceBefore);
  expect(
    (
      await a.client.rpc("retain_workout", {
        p_session: id,
        p_kind: "archive",
        p_request: crypto.randomUUID(),
        p_expected: 0,
      })
    ).error,
  ).toBeNull();
  await page.goto(`/workout/${id}/complete?achievements=all`);
  await expect(
    page.getByRole("heading", { name: "Workout Complete!", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".achievement-card")).toHaveCount(0);
  expect(
    (
      await a.client.rpc("retain_workout", {
        p_session: id,
        p_kind: "delete",
        p_request: crypto.randomUUID(),
        p_expected: 1,
      })
    ).error,
  ).toBeNull();
  await page.goto(`/workout/${id}/complete`);
  await expect(
    page.getByRole("heading", { name: "Workout Complete!", exact: true }),
  ).toHaveCount(0);
  const empty = await a.client.rpc("start_ad_hoc_workout");
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: empty.data,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  const emptyBefore = await savedEvidence(a);
  await page.goto(`/workout/${empty.data}/complete`);
  await expect(completion(page)).toContainText(
    "No qualifying working sets were recorded.",
  );
  await expect(completion(page)).not.toContainText(
    "Another session in the books.",
  );
  await expect(
    completion(page).locator(".completion-statistics dd").nth(1),
  ).toHaveText("0");
  await expect(completion(page).locator(".save-favorite")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("complete-empty.png"),
    fullPage: true,
  });
  expect(await savedEvidence(a)).toEqual(emptyBefore);
});
test("reviewing completion never replays an automatic program ending", async ({
  page,
}) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 8, 1);
  const assignment = (await a.client.rpc("program_schedule")).data
    .assignmentId as string;
  expect(
    (
      await a.client.rpc("program_lifecycle", {
        p_kind: "end_after_next",
        p_request: crypto.randomUUID(),
        p_assignment: assignment,
        p_expected: 0,
      })
    ).error,
  ).toBeNull();
  const item = await programItem(a, p.session, p.exercise);
  await log(a, item, 1, 12);
  await loginSelection(page, a);
  await page.goto(`/workout/${p.session}`);
  await finish(page, false);
  const before = (
    await a.client
      .from("program_assignments")
      .select(
        "state,terminal_reason,terminal_session_id,ended_at,lifecycle_revision",
      )
      .eq("id", assignment)
      .single()
  ).data;
  expect(before?.terminal_reason).toBe("ended_after_next");
  const evidenceBefore = await savedEvidence(a);
  await page.reload();
  await page.goto(`/workout/${p.session}/complete?achievements=all`);
  await expect(completion(page).getByRole("progressbar")).toHaveAttribute(
    "value",
    "1",
  );
  expect(
    (
      await a.client
        .from("program_assignments")
        .select(
          "state,terminal_reason,terminal_session_id,ended_at,lifecycle_revision",
        )
        .eq("id", assignment)
        .single()
    ).data,
  ).toEqual(before);
  expect(await savedEvidence(a)).toEqual(evidenceBefore);
});
