import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { localAuth, verifiedAccount } from "./auth-helpers";
import { loginSelection } from "./selection-helpers";
function fixtureSql(sql: string) {
  localAuth(); // Refuses non-local configured targets before any privileged fixture.
  return execFileSync(
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
    { input: sql, encoding: "utf8" },
  );
}
function expire(owner: string, session?: string) {
  expect(owner).toMatch(/^[a-f0-9-]{36}$/);
  if (session) expect(session).toMatch(/^[a-f0-9-]{36}$/);
  fixtureSql(
    `update body_private.account_trials set activated_at=statement_timestamp()-interval '336 hours 1 minute',expires_at=statement_timestamp()-interval '1 minute' where owner_id='${owner}'; update body_private.access_grants g set valid_from=t.activated_at,expires_at=t.expires_at from body_private.account_trials t where g.owner_id=t.owner_id and g.kind='trial' and g.owner_id='${owner}'; ${session ? `update public.workout_sessions w set access_authorized_at=t.expires_at-interval '1 minute',access_continuation_until=t.expires_at+interval '4 hours' from body_private.account_trials t where w.id='${session}' and w.owner_id=t.owner_id;` : ""}`,
  );
}
test.setTimeout(120000);
test("verified trial is stable, expiration keeps history/settings, protected lifetime fixture restores access", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  const initial = await a.client.rpc("account_access");
  expect(initial.data?.allowed).toBe(true);
  for (let retry = 0; retry < 3; retry++)
    expect((await a.client.rpc("activate_account_trial")).error).toBeNull();
  expect((await a.client.rpc("account_access")).data?.trialExpiresAt).toBe(
    initial.data.trialExpiresAt,
  );
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Your 14-day trial" }),
  ).toBeVisible();
  const session = await a.client.rpc("start_ad_hoc_workout");
  expect(session.error).toBeNull();
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: session.data,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  expire(a.userId);
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({
      colorScheme: width === 390 ? "dark" : "light",
      reducedMotion: "reduce",
    });
    await page.goto("/workout");
    await expect(
      page.getByRole("heading", { name: "Your free trial has ended." }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`expired-${width}.png`),
      fullPage: true,
    });
  }
  expect((await a.client.rpc("start_ad_hoc_workout")).error?.code).toBe(
    "P7701",
  );
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "Workout history", exact: true }),
  ).toBeVisible();
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("id")
        .eq("id", session.data)
    ).data,
  ).toHaveLength(1);
  await page.goto("/access");
  await expect(
    page.getByText("Checkout is not available yet.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /subscribe|pay|checkout/i }),
  ).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  fixtureSql(
    `insert into body_private.access_grants(owner_id,kind,source,source_reference,valid_from) values('${a.userId}','lifetime','local-browser-fixture','${randomUUID()}',clock_timestamp());`,
  );
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Training access is active" }),
  ).toBeVisible();
  expect((await a.client.rpc("start_ad_hoc_workout")).error).toBeNull();
});
test("same workout continues after expiry; fixed deadline denies new writes and preserves committed evidence", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  const start = await a.client.rpc("start_ad_hoc_workout");
  expect(start.error).toBeNull();
  const item = randomUUID();
  expect(
    (
      await a.client.rpc("record_workout_cardio", {
        p_session: start.data,
        p_item: item,
        p_operation: "add",
        p_expected: 0,
        p_activity: "bike",
        p_seconds: null,
        p_request: randomUUID(),
      })
    ).error,
  ).toBeNull();
  expire(a.userId, start.data);
  await loginSelection(page, a);
  await page.goto(`/workout/${start.data}`);
  await expect(
    page.getByText("You can finish this workout until", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Cardio", exact: true }),
  ).toBeEnabled();
  const request = randomUUID();
  const save = {
    p_session: start.data,
    p_item: item,
    p_operation: "save",
    p_expected: 1,
    p_activity: "bike",
    p_seconds: 600,
    p_request: request,
  };
  expect((await a.client.rpc("record_workout_cardio", save)).error).toBeNull();
  fixtureSql(
    `update public.workout_sessions set access_continuation_until=clock_timestamp()-interval '1 second' where id='${start.data}';`,
  );
  expect((await a.client.rpc("record_workout_cardio", save)).error).toBeNull();
  expect(
    (
      await a.client.rpc("record_workout_cardio", {
        ...save,
        p_expected: 2,
        p_request: randomUUID(),
      })
    ).error?.code,
  ).toBe("P7701");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add Cardio", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("10 min recorded")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("continuation-ended.png"),
    fullPage: true,
  });
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("status")
        .eq("id", start.data)
        .single()
    ).data?.status,
  ).toBe("in_progress");
});
