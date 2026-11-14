import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { localAuth, verifiedAccount } from "../e2e/auth-helpers";
import { loginSelection } from "../e2e/selection-helpers";
function expire(owner: string) {
  localAuth();
  expect(owner).toMatch(/^[a-f0-9-]{36}$/);
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_body",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: `update body_private.account_trials set activated_at=statement_timestamp()-interval '336 hours 1 minute',expires_at=statement_timestamp()-interval '1 minute' where owner_id='${owner}'; update body_private.access_grants g set valid_from=t.activated_at,expires_at=t.expires_at from body_private.account_trials t where g.owner_id=t.owner_id and g.kind='trial' and g.owner_id='${owner}';`,
    },
  );
}
test("expired access actions retain keyboard order and fit 200 percent text in both themes", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  expire(a.userId);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/workout");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const primary = page.getByRole("link", {
      name: "View Access Options",
      exact: true,
    });
    const history = page.getByRole("link", {
      name: "View Workout History",
      exact: true,
    });
    await primary.focus();
    await expect(primary).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(history).toBeFocused();
    const width = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(width.document).toBeLessThanOrEqual(width.viewport);
    expect((await primary.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: info.outputPath(`expired-200-text-${colorScheme}.png`),
      fullPage: true,
    });
  }
});
test("record local entitlement navigation and HTTP mutation timing without payloads", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  const samples: { operation: string; ms: number }[] = [];
  for (const path of ["/dashboard", "/workout", "/profile"]) {
    const start = performance.now();
    await page.goto(path);
    await expect(page.locator("main h1").first()).toBeVisible();
    samples.push({ operation: path, ms: performance.now() - start });
  }
  let started = performance.now();
  const workout = await a.client.rpc("start_ad_hoc_workout");
  expect(workout.error).toBeNull();
  samples.push({
    operation: "new-workout-rpc",
    ms: performance.now() - started,
  });
  started = performance.now();
  await page.goto(`/workout/${workout.data}`);
  await expect(
    page.getByRole("button", { name: "Add Cardio", exact: true }),
  ).toBeVisible();
  samples.push({ operation: "workout-home", ms: performance.now() - started });
  const item = crypto.randomUUID();
  expect(
    (
      await a.client.rpc("record_workout_cardio", {
        p_session: workout.data,
        p_item: item,
        p_operation: "add",
        p_expected: 0,
        p_activity: "bike",
        p_seconds: null,
        p_request: crypto.randomUUID(),
      })
    ).error,
  ).toBeNull();
  started = performance.now();
  expect(
    (
      await a.client.rpc("record_workout_cardio", {
        p_session: workout.data,
        p_item: item,
        p_operation: "save",
        p_expected: 1,
        p_activity: "bike",
        p_seconds: 600,
        p_request: crypto.randomUUID(),
      })
    ).error,
  ).toBeNull();
  samples.push({
    operation: "cardio-save-rpc",
    ms: performance.now() - started,
  });
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: workout.data,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  expire(a.userId);
  started = performance.now();
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "Workout history", exact: true }),
  ).toBeVisible();
  samples.push({
    operation: "expired-history",
    ms: performance.now() - started,
  });
  await writeFile(
    info.outputPath("entitlement-navigation.json"),
    JSON.stringify(
      {
        environment:
          "local production Next.js, local Supabase; no baseline comparison",
        samples,
      },
      null,
      2,
    ),
  );
});
