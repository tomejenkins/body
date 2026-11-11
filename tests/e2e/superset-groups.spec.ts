import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { verifiedAccount } from "./auth-helpers";
import { loginSelection, type Account } from "./selection-helpers";
import type { ExerciseGroup } from "../../src/features/grouping/model";

test.setTimeout(180000);
const cards = (p: Page) => p.locator(".superset-card");
async function groups(a: Account, session: string): Promise<ExerciseGroup[]> {
  const r = await a.client.rpc("workout_groups", { p_session: session });
  expect(r.error).toBeNull();
  return r.data;
}
async function fullBody(page: Page) {
  await page.goto("/workout/new");
  await page.getByRole("radio", { name: "Full Body", exact: true }).check();
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]{36}$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}
async function create(page: Page, indices: number[]) {
  await page.locator(".create-superset-shortcut").click();
  const dialog = page.getByRole("dialog", {
    name: "Create Superset",
    exact: true,
  });
  for (const i of indices) await dialog.getByRole("checkbox").nth(i).check();
  await dialog
    .getByRole("button", { name: "Create Superset", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
}
async function chooseMembers(page: Page, card: Locator, count: number) {
  if (
    (await card.locator(".superset-expand").getAttribute("aria-expanded")) !==
    "true"
  )
    await card.locator(".superset-expand").click();
  for (let i = 0; i < count; i++) {
    const picker = card.getByRole("region", {
      name: `A${i + 1} exercise selection`,
      exact: true,
    });
    await picker.locator(".movement-tile:not(:disabled)").first().click();
    await expect(
      picker.locator(".movement-tile[aria-pressed=true]"),
    ).toHaveCount(1);
  }
}
async function save(row: Locator) {
  const weight = row.getByRole("textbox", { name: /weight/ });
  if (await weight.count()) await weight.fill("100");
  await row.getByRole("textbox", { name: / reps$/ }).fill("8");
  await row.getByRole("checkbox", { name: / complete$/ }).click();
  await expect(row.locator(".set-save-state")).toHaveText(/^Saved/);
}

test("two groups before exercise choice, shared round logging, unequal sets, edits and final History", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  const session = await fullBody(page);
  await create(page, [0, 1]);
  await create(page, [2, 3]);
  await expect(cards(page)).toHaveCount(2);
  expect(
    (
      await a.client
        .from("workout_exercises")
        .select("id")
        .eq("workout_session_id", session)
    ).data,
  ).toEqual([]);
  await chooseMembers(page, cards(page).first(), 2);
  await cards(page)
    .first()
    .getByRole("button", { name: "Start Superset", exact: true })
    .click();
  await expect(page).toHaveURL(/group=/);
  await expect(page.locator(".superset-round")).toHaveCount(3);
  await expect(page.locator(".movement-carousel")).toHaveCount(0);
  const first = page.locator(".logged-set").first();
  await save(first);
  const setId = await first.getAttribute("data-set-id");
  const actual = (
    await a.client.from("workout_sets").select("*").eq("id", setId).single()
  ).data;
  for (let i = 1; i < 6; i++) await save(page.locator(".logged-set").nth(i));
  const roundOne = page.getByRole("region", { name: "Round 1", exact: true });
  await expect(roundOne.getByRole("heading", { level: 2 })).toContainText(
    "Saved",
  );
  let release = () => {},
    arrive = () => {},
    held = false;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    arrived = new Promise<void>((r) => {
      arrive = r;
    });
  await page.route("**/workout/**", async (route) => {
    let command;
    try {
      command = JSON.parse(route.request().postData() ?? "[]")[0];
    } catch {}
    if (command?.operation === "save" && !held) {
      held = true;
      const response = await route.fetch();
      arrive();
      await gate;
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  const correction = page.locator(".logged-set").nth(1);
  await correction.getByRole("textbox", { name: /weight/ }).fill("110");
  await correction.getByRole("textbox", { name: /weight/ }).press("Tab");
  await arrived;
  try {
    await expect(correction.locator(".set-save-state")).toContainText("Saving");
    await expect(roundOne.getByRole("heading", { level: 2 })).not.toContainText(
      "Saved",
    );
  } finally {
    release();
  }
  await expect(correction.locator(".set-save-state")).toHaveText(/^Saved/);
  await expect(roundOne.getByRole("heading", { level: 2 })).toContainText(
    "Saved",
  );
  await page.unroute("**/workout/**");
  await page.getByRole("button", { name: "Add A1 Set", exact: true }).click();
  await expect(page.locator(".superset-round")).toHaveCount(4);
  await expect(
    page.locator(".superset-round").last().locator(".logged-set"),
  ).toHaveCount(1);
  await save(page.locator(".logged-set").last());
  await page.screenshot({
    path: info.outputPath("rounds-unequal.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Next Exercise", exact: true })
    .click();
  await expect(
    page.locator(".superset-expand[aria-expanded=true]"),
  ).toHaveCount(0);
  const before = (await groups(a, session))[0];
  await cards(page)
    .first()
    .getByRole("button", { name: "Manage Superset 1", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit / Reorder Superset" }).click();
  const editor = page.getByRole("dialog", {
    name: "Edit Superset",
    exact: true,
  });
  await editor.getByRole("checkbox").nth(4).check();
  await editor.getByRole("button", { name: /Move A2 up/ }).click();
  await editor
    .getByRole("button", { name: "Save Superset", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  const edited = (await groups(a, session)).find((g) => g.id === before.id)!;
  expect(edited.members).toHaveLength(3);
  expect(edited.members[0]).toEqual(before.members[1]);
  expect(
    (await a.client.from("workout_sets").select("*").eq("id", setId).single())
      .data,
  ).toEqual(actual);
  await page.screenshot({
    path: info.outputPath("home-three-members.png"),
    fullPage: true,
  });
  await cards(page).first().locator(".superset-expand").click();
  const third = cards(page)
    .first()
    .getByRole("region", { name: "A3 exercise selection", exact: true });
  await third.locator(".movement-tile:not(:disabled)").first().click();
  await expect(third.locator(".movement-tile[aria-pressed=true]")).toHaveCount(
    1,
  );
  await cards(page)
    .first()
    .getByRole("button", { name: "Continue Superset", exact: true })
    .click();
  await expect(page.locator(".logged-set")).toHaveCount(10);
  for (let i = 0; i < 10; i++) {
    const row = page.locator(".logged-set").nth(i);
    if (!(await row.getByRole("checkbox", { name: / complete$/ }).isChecked()))
      await save(row);
  }
  await page.screenshot({
    path: info.outputPath("three-member-rounds.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Next Exercise", exact: true })
    .click();
  await cards(page)
    .first()
    .getByRole("button", { name: "Manage Superset 1", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit / Reorder Superset" }).click();
  await editor.getByRole("checkbox").nth(4).uncheck();
  await editor
    .getByRole("button", { name: "Save Superset", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(
    (await groups(a, session)).find((g) => g.id === before.id)?.members,
  ).toHaveLength(2);
  await cards(page)
    .first()
    .getByRole("button", { name: "Manage Superset 1", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Ungroup", exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  expect(
    (await a.client.from("workout_sets").select("*").eq("id", setId).single())
      .data,
  ).toEqual(actual);
  await create(page, [0, 1]);
  await expect(cards(page)).toHaveCount(2);
  // Closure still uses the ordinary partial-workout path; grouping adds no completion evidence.
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: session,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  await page.goto(`/history/${session}`);
  await expect(page.locator(".history-superset")).toHaveCount(2);
  await expect(page.locator(".history-superset").first()).toContainText("A2");
  await page.screenshot({
    path: info.outputPath("history-final-groups.png"),
    fullPage: true,
  });
});

test("overlap and stale concurrent commands serialize; retries and owner boundaries preserve actuals", async ({
  page,
}) => {
  const a = await verifiedAccount(),
    b = await verifiedAccount();
  await loginSelection(page, a);
  const session = await fullBody(page);
  const movement = await a.client
    .from("workout_movements")
    .select("id")
    .eq("workout_session_id", session)
    .order("position");
  expect(movement.error).toBeNull();
  const members = movement
    .data!.slice(0, 2)
    .map((m) => ({ type: "movement", id: m.id }));
  const command = {
    p_session: session,
    p_group: randomUUID(),
    p_operation: "create",
    p_expected: 0,
    p_members: members,
    p_request: randomUUID(),
  };
  const competing = {
    ...command,
    p_group: randomUUID(),
    p_request: randomUUID(),
  };
  const starts = await Promise.all([
    a.client.rpc("change_workout_group", command),
    a.client.rpc("change_workout_group", competing),
  ]);
  expect(starts.filter((r) => !r.error)).toHaveLength(1);
  expect(starts.find((r) => r.error)?.error?.code).toBe("23514");
  const winning = starts[0].error ? competing : command;
  expect(
    (await a.client.rpc("change_workout_group", winning)).error,
  ).toBeNull();
  const g = (await groups(a, session))[0];
  const edits = await Promise.all([
    a.client.rpc("change_workout_group", {
      ...winning,
      p_operation: "edit",
      p_expected: 1,
      p_members: [...members].reverse(),
      p_request: randomUUID(),
    }),
    a.client.rpc("change_workout_group", {
      ...winning,
      p_operation: "edit",
      p_expected: 1,
      p_members: members,
      p_request: randomUUID(),
    }),
  ]);
  expect(edits.filter((r) => !r.error)).toHaveLength(1);
  expect(edits.find((r) => r.error)?.error?.code).toBe("40001");
  expect((await groups(a, session))[0].id).toBe(g.id);
  expect(
    (await b.client.rpc("workout_groups", { p_session: session })).error?.code,
  ).toBe("42501");
  expect(
    (await b.client.rpc("change_workout_group", winning)).error?.code,
  ).toBe("42501");
  expect(
    (await a.client.from("workout_sets").select("id").eq("owner_id", a.userId))
      .data,
  ).toEqual([]);
});

test("builder responsive themes, focus return, reduced motion, large text and bounded pickers", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  await fullBody(page);
  await create(page, [0, 1, 2]);
  await create(page, [3, 4]);
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.locator(".create-superset-shortcut").click();
      const dialog = page.getByRole("dialog", {
        name: "Create Superset",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: info.outputPath(`builder-${width}-${colorScheme}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(page.locator(".create-superset-shortcut")).toBeFocused();
      await page.screenshot({
        path: info.outputPath(`home-${width}-${colorScheme}.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const largeText = await page.addStyleTag({
    content: "html{font-size:200% !important}",
  });
  await page.locator(".create-superset-shortcut").click();
  await expect(
    page.getByRole("dialog", { name: "Create Superset", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("builder-200-percent.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".movement-carousel")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("home-200-percent.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await cards(page)
    .first()
    .getByRole("button", { name: "Manage Superset 1", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit / Reorder Superset" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit Superset", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("edit-three-200-percent.png"),
  });
  await page.keyboard.press("Escape");
  await largeText.evaluate((el) => el.parentNode?.removeChild(el));
  await cards(page).first().locator(".superset-expand").click();
  await expect(
    cards(page).first().locator(".superset-member-pickers .movement-carousel"),
  ).toHaveCount(3);
  await page.screenshot({
    path: info.outputPath("expanded-three-pickers-390-dark.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".create-superset-shortcut").click();
  await page.locator(".management-overlay").click({ position: { x: 5, y: 5 } });
  await expect(
    page.getByRole("dialog", { name: "Create Superset", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".create-superset-shortcut")).toBeFocused();
});

test("both official programs instantiate immutable groups; grouped Favorites remain independent", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  for (const slug of [
    "upper-lower-superset-split",
    "full-body-superset-training",
  ]) {
    const v = await a.client
      .from("program_versions")
      .select("id,definition")
      .eq("definition->program->>slug", slug)
      .single();
    expect(v.error).toBeNull();
    const current = await a.client
      .from("program_assignments")
      .select("id,lifecycle_revision")
      .eq("state", "active")
      .maybeSingle();
    const enrollment = await a.client.rpc("program_lifecycle", {
      p_kind: current.data ? "switch" : "start",
      p_request: randomUUID(),
      p_assignment: current.data?.id ?? null,
      p_expected: current.data?.lifecycle_revision ?? 0,
      p_version: v.data!.id,
      p_start: new Date().toISOString().slice(0, 10),
      p_timezone: "UTC",
    });
    expect(enrollment.error).toBeNull();
    const w = await a.client.rpc("start_program_workout", {
      p_version: v.data!.id,
      p_workout: 1,
      p_request: randomUUID(),
    });
    expect(w.error).toBeNull();
    await page.goto(`/workout/${w.data}`);
    await expect(cards(page)).toHaveCount(2);
    expect((await groups(a, w.data)).every((g) => g.sourceGroupId)).toBe(true);
    await chooseMembers(page, cards(page).first(), 2);
    await cards(page)
      .first()
      .getByRole("button", { name: "Start Superset", exact: true })
      .click();
    const rows = page.locator(".logged-set");
    await expect(rows).toHaveCount(6);
    for (let i = 0; i < (await rows.count()); i++) await save(rows.nth(i));
    await page.screenshot({
      path: info.outputPath(`${slug}-logger.png`),
      fullPage: true,
    });
    expect(
      (
        await a.client.rpc("end_workout", {
          p_session: w.data,
          p_outcome: "completed",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await a.client
          .from("workout_sessions")
          .select("completion_status")
          .eq("id", w.data)
          .single()
      ).data?.completion_status,
    ).toBe("partial");
    expect(
      (
        await a.client
          .from("program_versions")
          .select("definition")
          .eq("id", v.data!.id)
          .single()
      ).data?.definition,
    ).toEqual(v.data!.definition);
    const f = await a.client.rpc("save_favorite_workout", {
      p_type: "completed_workout",
      p_source: w.data,
      p_day: null,
      p_name: "Grouped structure",
      p_request: randomUUID(),
    });
    expect(f.error).toBeNull();
    const launched = await a.client.rpc("start_favorite_workout", {
      p_favorite: f.data,
      p_request: randomUUID(),
    });
    expect(launched.error).toBeNull();
    await page.goto(`/workout/${launched.data}`);
    await expect(cards(page)).toHaveCount(1);
    const session = await a.client
      .from("workout_sessions")
      .select("program_assignment_id,source_program_version_id")
      .eq("id", launched.data)
      .single();
    expect(session.data).toEqual({
      program_assignment_id: null,
      source_program_version_id: null,
    });
    const selections = await a.client
      .from("workout_exercises")
      .select("id")
      .eq("workout_session_id", launched.data);
    if (selections.data?.length)
      expect(
        (
          await a.client
            .from("workout_sets")
            .select("actual_reps,actual_weight_kg,status")
            .in(
              "workout_exercise_id",
              selections.data.map((e) => e.id),
            )
        ).data?.every(
          (s) =>
            s.status === "pending" &&
            s.actual_reps === null &&
            s.actual_weight_kg === null,
        ),
      ).toBe(true);
    expect(
      (
        await a.client.rpc("end_workout", {
          p_session: launched.data,
          p_outcome: "abandoned",
        })
      ).error,
    ).toBeNull();
  }
});

test("lost grouping acknowledgement retries the exact receipt without duplicating a group", async ({
  page,
}) => {
  const a = await verifiedAccount();
  await loginSelection(page, a);
  const session = await fullBody(page);
  let dropped = false;
  const requests: Record<string, unknown>[] = [];
  await page.route("**/workout/**", async (route) => {
    let c;
    try {
      c = JSON.parse(route.request().postData() ?? "[]")[0];
    } catch {}
    if (c?.operation === "create" && c?.members) {
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
  await page.locator(".create-superset-shortcut").click();
  const dialog = page.getByRole("dialog", {
    name: "Create Superset",
    exact: true,
  });
  await dialog.getByRole("checkbox").nth(0).check();
  await dialog.getByRole("checkbox").nth(1).check();
  await dialog
    .getByRole("button", { name: "Create Superset", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(await groups(a, session)).toHaveLength(1);
  await dialog
    .getByRole("button", { name: "Create Superset", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(await groups(a, session)).toHaveLength(1);
  expect(
    (
      await a.client
        .from("workout_group_commands")
        .select("request_id")
        .eq("workout_session_id", session)
    ).data,
  ).toHaveLength(1);
});
