import { test, expect } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import { loginSelection } from "./selection-helpers";
import { openWorkoutEnding } from "./workout-screen-helpers";
import { randomUUID } from "node:crypto";

test.setTimeout(120000);
test("cardio-only workout saves duration, shows completion/history and never fabricates strength work", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  const start = await a.client.rpc("start_ad_hoc_workout");
  expect(start.error).toBeNull();
  await loginSelection(page, a);
  await page.goto(`/workout/${start.data}`);
  await page.getByRole("button", { name: "Add Cardio", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Add Cardio", exact: true });
  await expect(
    sheet.getByRole("combobox", { name: "Cardio activity" }).locator("option"),
  ).toHaveCount(5);
  await sheet.getByRole("combobox").selectOption("treadmill");
  await sheet.getByRole("button", { name: "Add Cardio", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  const card = page.locator(".cardio-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Duration not recorded");
  await card.getByRole("button", { name: "Edit Treadmill cardio" }).click();
  const editor = page.getByRole("dialog", { name: "Edit Treadmill cardio" });
  for (const minutes of ["", "0", "-1", "abc", "1441"]) {
    await editor.getByRole("textbox").fill(minutes);
    await editor
      .getByRole("button", { name: "Save Cardio", exact: true })
      .click();
    await expect(editor.getByRole("alert")).toContainText("Enter a duration");
  }
  await editor.getByRole("textbox").fill("20");
  await editor
    .getByRole("button", { name: "Save Cardio", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(card).toContainText("20 min recorded");
  await expect(page.locator(".workout-progress-summary")).toHaveText(
    "1 of 1 cardio activities recorded",
  );
  await page.screenshot({
    path: info.outputPath("cardio-workout-home.png"),
    fullPage: true,
  });
  expect(
    (
      await a.client
        .from("workout_exercises")
        .select("id")
        .eq("workout_session_id", start.data)
    ).data,
  ).toEqual([]);
  expect(
    (await a.client.from("workout_sets").select("id").eq("owner_id", a.userId))
      .data,
  ).toEqual([]);
  await openWorkoutEnding(page);
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/complete$/);
  await expect(
    page.getByRole("region", { name: "Manual cardio" }),
  ).toContainText("20 min recorded");
  await expect(
    page.getByRole("button", { name: "Save as Favorite", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("cardio-completion.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "View Full Workout", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Manual cardio" }),
  ).toContainText("Treadmill");
  await expect(
    page.getByText("Finished · Cardio", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("cardio-history.png"),
    fullPage: true,
  });
});

test("cardio uncertain acknowledgement retries exactly once, and stale/foreign revisions are rejected", async ({
  page,
}) => {
  const a = await verifiedAccount(),
    b = await verifiedAccount();
  const w = await a.client.rpc("start_ad_hoc_workout");
  expect(w.error).toBeNull();
  await loginSelection(page, a);
  await page.goto(`/workout/${w.data}`);
  await page.getByRole("button", { name: "Add Cardio", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add Cardio", exact: true })
    .click();
  await expect(page.locator(".cardio-card")).toHaveCount(1);
  await page.locator(".cardio-card").getByRole("button").click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox").fill("15");
  let dropped = false;
  const requests: unknown[] = [];
  await page.route("**/workout/**", async (route) => {
    let c;
    try {
      c = JSON.parse(route.request().postData() ?? "[]")[0];
    } catch {}
    if (c?.operation === "save" && c?.activity) {
      requests.push(c);
      if (!dropped) {
        dropped = true;
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await editor
    .getByRole("button", { name: "Save Cardio", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toBeVisible();
  await expect(editor.getByRole("textbox")).toHaveValue("15");
  await editor
    .getByRole("button", { name: "Save Cardio", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  const list = await a.client.rpc("workout_cardio_items", {
    p_session: w.data,
  });
  expect(list.error).toBeNull();
  const item = list.data[0];
  expect(
    (await b.client.rpc("workout_cardio_items", { p_session: w.data })).error
      ?.code,
  ).toBe("42501");
  const command = {
    p_session: w.data,
    p_item: item.id,
    p_operation: "save",
    p_expected: item.revision,
    p_activity: item.activity,
    p_seconds: 1000,
    p_request: randomUUID(),
  };
  const concurrent = await Promise.all([
    a.client.rpc("record_workout_cardio", command),
    a.client.rpc("record_workout_cardio", {
      ...command,
      p_seconds: 1100,
      p_request: randomUUID(),
    }),
  ]);
  expect(concurrent.filter((r) => !r.error)).toHaveLength(1);
  expect(concurrent.find((r) => r.error)?.error?.code).toBe("40001");
});

test("set gears preserve effort/type/removal, compact Supersets coexist with cardio and Favorites omit actual durations", async ({
  page,
}, info) => {
  const { fixture } = await import("../audit/helpers");
  const { openSetSettings, openAdvancedEffort, closeSetSettings } =
    await import("./set-options-helpers");
  const c = await fixture(page);
  const row = page.locator(".logged-set").first();
  await openAdvancedEffort(row);
  await row.getByRole("combobox", { name: /effort scale/ }).selectOption("rir");
  await expect(row.locator(".set-save-state")).toHaveText(/^Saved/);
  await row.getByRole("combobox", { name: /effort rating/ }).selectOption("2");
  await expect(row.locator(".set-save-state")).toHaveText(/^Saved/);
  await row.getByRole("combobox", { name: /type/ }).selectOption("drop");
  await expect(row.locator(".set-save-state")).toHaveText(/^Saved/);
  await page.screenshot({
    path: info.outputPath("set-gear-effort.png"),
    fullPage: true,
  });
  await closeSetSettings(row);
  const third = page.locator(".logged-set").nth(2);
  await openSetSettings(third);
  await third.getByRole("button", { name: /Delete/ }).click();
  await expect(page.locator(".logged-set")).toHaveCount(2);
  const curl = await c.a.client
    .from("exercises")
    .select("id")
    .eq("slug", "standing_dumbbell_curl")
    .single();
  expect(curl.error).toBeNull();
  expect(
    (
      await c.a.client.rpc("edit_workout", {
        p_session: c.session,
        p_operation: "add",
        p_exercise: curl.data!.id,
      })
    ).error,
  ).toBeNull();
  await page.goto(`/workout/${c.session}`);
  await page.locator(".create-superset-shortcut").click();
  const group = page.getByRole("dialog", {
    name: "Create Superset",
    exact: true,
  });
  await group.getByRole("checkbox").nth(0).check();
  await group.getByRole("checkbox").nth(1).check();
  await group
    .getByRole("button", { name: "Create Superset", exact: true })
    .click();
  await expect(group).toHaveCount(0);
  await expect(page.locator(".superset-card")).toHaveCount(1);
  const style = await page.locator(".superset-card").evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    radius: getComputedStyle(el).borderRadius,
  }));
  expect(style.radius).toBe("0px");
  await page.getByRole("button", { name: "Add Cardio", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox")
    .selectOption("stationary_bike");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add Cardio", exact: true })
    .click();
  await expect(page.locator(".cardio-card")).toHaveCount(1);
  await page.locator(".cardio-card").getByRole("button").click();
  await page.getByRole("dialog").getByRole("textbox").fill("10:30");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save Cardio", exact: true })
    .click();
  await expect(page.locator(".cardio-card")).toContainText(
    "10 min 30 sec recorded",
  );
  await page.screenshot({
    path: info.outputPath("mixed-superset-cardio-home.png"),
    fullPage: true,
  });
  await openWorkoutEnding(page);
  await page
    .getByRole("checkbox", { name: /Finish without completing all sets/ })
    .check();
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page).toHaveURL(/complete$/);
  await expect(
    page.getByRole("region", { name: "Manual cardio" }),
  ).toContainText("10 min 30 sec");
  await expect(
    page.getByText(/Favorites save strength movements only/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save as Favorite", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Favorite shortcut", exact: true }),
  ).toContainText("Saved to Favorites");
  const f = await c.a.client
    .from("favorite_workouts")
    .select("id,definition")
    .eq("source_session_id", c.session)
    .single();
  expect(f.error).toBeNull();
  expect(JSON.stringify(f.data!.definition)).not.toMatch(
    /durationSeconds|duration_seconds|cardio/,
  );
  const launched = await c.a.client.rpc("start_favorite_workout", {
    p_favorite: f.data!.id,
    p_request: randomUUID(),
  });
  expect(launched.error).toBeNull();
  expect(
    (await c.a.client.rpc("workout_cardio_items", { p_session: launched.data }))
      .data,
  ).toEqual([]);
});
