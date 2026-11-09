import {
  openWorkoutEnding,
  openExerciseLogger,
} from "./workout-screen-helpers";
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { verifiedAccount, localAuth } from "./auth-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(180000);
type Account = Awaited<ReturnType<typeof verifiedAccount>>;
const exercise = (slug: string) => {
  const e = catalog.exercises.find((e) => e.slug === slug);
  if (!e) throw Error("Missing fixture");
  return e.id;
};
async function login(page: Page, a: Account) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function start(a: Account, slugs = ["barbell_bench_press"]) {
  const w = await a.client.rpc("start_ad_hoc_workout");
  expect(w.error).toBeNull();
  for (const slug of slugs) {
    expect(
      (
        await a.client.rpc("edit_workout", {
          p_session: w.data,
          p_operation: "add",
          p_exercise: exercise(slug),
        })
      ).error,
    ).toBeNull();
  }
  return w.data as string;
}
async function perform(a: Account, w: string, kg: number, reps: number) {
  const items = await a.client
    .from("workout_exercises")
    .select("id")
    .eq("workout_session_id", w);
  for (const item of items.data ?? []) {
    const rows = await a.client
      .from("workout_sets")
      .select("id,revision")
      .eq("workout_exercise_id", item.id)
      .order("position");
    const row = rows.data?.[0];
    if (!row) throw Error("Missing set");
    expect(
      (
        await a.client.rpc("log_workout_set", {
          p_item: item.id,
          p_id: row.id,
          p_operation: "save",
          p_revision: row.revision,
          p_mutation: randomUUID(),
          p_reps: reps,
          p_weight: kg,
          p_completed: true,
        })
      ).error,
    ).toBeNull();
  }
}
// Deterministic clock fixtures ONLY on the disposable Docker database. Never add
// a production clock override, privileged app endpoint, remote connection or key.
function age(a: Account, w: string, minutes: 90 | 720) {
  localAuth();
  for (const id of [a.userId, w])
    if (!/^[0-9a-f-]{36}$/.test(id)) throw Error("Invalid fixture UUID");
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
      `update public.workout_sessions set started_at=clock_timestamp()-interval '${minutes + 60} minutes',last_activity_at=clock_timestamp()-interval '${minutes} minutes',activity_evidence_at=clock_timestamp()-interval '${minutes} minutes' where id='${w}'::uuid and owner_id='${a.userId}'::uuid and status='in_progress'`,
    ],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        DOCKER_HOST: undefined,
        DOCKER_CONTEXT: undefined,
        DOCKER_TLS: undefined,
        DOCKER_TLS_VERIFY: undefined,
        DOCKER_CERT_PATH: undefined,
      },
    },
  );
}
test("persistent bar survives navigation/refresh, hides in logger and leaves after finish", async ({
  page,
}, testInfo) => {
  const a = await verifiedAccount();
  await login(page, a);
  const w = await start(a);
  await perform(a, w, 100, 3);
  for (const path of [
    "/dashboard",
    "/history",
    "/exercises",
    `/exercises/${exercise("barbell_bench_press")}`,
    `/exercises/${exercise("barbell_bench_press")}/history`,
    "/profile",
  ]) {
    await page.goto(path);
    const bar = page.getByRole("complementary", {
      name: "Active workout",
      exact: true,
    });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("1 of 3 sets completed");
    await expect(
      bar.getByRole("link", { name: "Resume", exact: true }),
    ).toHaveAttribute("href", `/workout/${w}`);
  }
  if (testInfo.project.name === "mobile") {
    const bar = await page
      .getByRole("complementary", { name: "Active workout", exact: true })
      .boundingBox();
    const nav = await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .boundingBox();
    expect(bar && nav && bar.y + bar.height <= nav.y).toBeTruthy();
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.screenshot({
        path: testInfo.outputPath(`continuity-${colorScheme}.png`),
        animations: "disabled",
        caret: "initial",
      });
    }
  }
  await page.reload();
  await page
    .getByRole("complementary", { name: "Active workout", exact: true })
    .getByRole("link", { name: "Resume", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/workout/${w}$`));
  await expect(
    page.getByRole("complementary", { name: "Active workout", exact: true }),
  ).toHaveCount(0);
  await openWorkoutEnding(page);
  await page
    .getByRole("checkbox", { name: /Finish without completing all sets/ })
    .check();
  await openWorkoutEnding(page);
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/complete$/);
  await expect(
    page.getByRole("complementary", { name: "Active workout", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".achievement-card")).toHaveCount(0);
});
test("inactive check-in estimates saved endpoint; resume keeps structured gap without manual times", async ({
  page,
}) => {
  const a = await verifiedAccount();
  await login(page, a);
  const w = await start(a);
  await perform(a, w, 100, 3);
  age(a, w, 90);
  await page.goto(`/workout/${w}`);
  const check = page.getByRole("region", {
    name: "Workout check-in",
    exact: true,
  });
  await expect(check).toBeVisible();
  await expect(check).toContainText("Estimated workout duration:");
  await expect(check.locator("input")).toHaveCount(0);
  await check
    .getByRole("button", { name: "Resume Workout", exact: true })
    .click();
  await expect(check).toHaveCount(0);
  const state = await a.client.rpc("workout_continuity", { p_session: w });
  expect(state.data.continuation_count).toBe(1);
  expect(state.data.idle_intervals).toHaveLength(1);
  age(a, w, 90);
  await page.reload();
  await expect(check).toBeVisible();
  await check
    .getByRole("button", { name: "Finish Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/complete$/);
  await page.goto(`/history/${w}`);
  await expect(page.locator("main")).toContainText(
    "Estimated workout duration:",
  );
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const saved = await a.client
    .from("workout_sessions")
    .select("duration_kind,effective_finished_at,last_activity_at,finished_at")
    .eq("id", w)
    .single();
  expect(saved.data?.duration_kind).toBe("estimated");
  expect(saved.data?.effective_finished_at).toBe(saved.data?.last_activity_at);
  expect(saved.data?.finished_at).not.toBe(saved.data?.effective_finished_at);
});
test("server expiration preserves performance and rejected local drafts remain reviewable", async ({
  page,
}) => {
  const a = await verifiedAccount();
  await login(page, a);
  const w = await start(a);
  await perform(a, w, 100, 3);
  await page.goto(`/workout/${w}`);
  await openExerciseLogger(page);
  const first = page.locator(".logged-set").first();
  await first.getByRole("textbox", { name: /reps/ }).fill("9");
  age(a, w, 720);
  await first.getByRole("textbox", { name: /reps/ }).blur();
  await expect(page.locator("main")).toContainText(
    /draft.*retained|not saved|closed after 12 hours/i,
  );
  await expect(first.getByRole("textbox", { name: /reps/ })).toHaveValue("9");
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await expect(
    page.getByText("Saved workout · Read only", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Unapplied drafts" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("closed after 12 hours");
  await expect(page.locator(".achievement-card")).toHaveCount(0);
  const state = await a.client.rpc("workout_continuity", { p_session: w });
  expect(state.data.status).toBe("abandoned");
  expect(state.data.completed).toBe(1);
  expect(state.data.total).toBe(3);
  await page.goto("/workout");
  await expect(
    page.getByRole("link", { name: "Start Other Workout", exact: true }),
  ).toBeVisible();
});
test("exact-rep records, honest empty states and three diverse completed achievements", async ({
  page,
}, testInfo) => {
  const a = await verifiedAccount();
  await login(page, a);
  await page.goto("/history/records");
  await expect(
    page.getByRole("heading", { name: "Personal Records", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No completed working sets recorded yet.", { exact: true }),
  ).toHaveCount(3);
  const slugs = [
    "barbell_bench_press",
    "barbell_back_squat",
    "conventional_deadlift",
    "standing_dumbbell_curl",
  ];
  const baseline = await start(a, slugs);
  await perform(a, baseline, 100, 3);
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: baseline,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  expect(
    (await a.client.rpc("workout_achievements", { p_session: baseline })).data,
  ).toEqual([]);
  const next = await start(a, slugs);
  await perform(a, next, 106.594, 5);
  await page.goto(`/workout/${next}`);
  const incomplete = page.getByRole("checkbox", {
    name: /Finish without completing all sets/,
  });
  if (await incomplete.isVisible()) await incomplete.check();
  await openWorkoutEnding(page);
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/complete$/);
  await expect(page.locator(".achievement-card")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".achievement-card")).toHaveCount(3);
  await page.goto("/history/records");
  const bench = page.locator(".record-card").filter({
    has: page.getByRole("heading", {
      name: "Barbell bench press",
      exact: true,
    }),
  });
  await expect(bench).toContainText("Best Triple");
  await expect(
    bench
      .locator("dl>div")
      .filter({ has: page.getByText("Best Triple", { exact: true }) }),
  ).toContainText("220.46 lb");
  await expect(bench).toContainText("Best Five-Rep Set");
  await expect(bench).not.toContainText("Best Single");
  await expect(bench).toContainText("Estimated 1RM");
  await expect(
    page.getByRole("heading", { name: "Standing dumbbell curl", exact: true }),
  ).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`records-${colorScheme}.png`),
      fullPage: true,
      animations: "disabled",
      caret: "initial",
    });
  }
  await page.goto(`/exercises/${exercise("barbell_bench_press")}/history`);
  await expect(
    page.getByRole("heading", { name: "Personal Records", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("Best Triple");
});
