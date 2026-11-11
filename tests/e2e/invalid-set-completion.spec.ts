import { expect, test, type Page, type Locator } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fixture } from "../audit/helpers";
import { verifiedAccount } from "./auth-helpers";
import { loginSelection } from "./selection-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };

test.setTimeout(120000);
test.use({ video: "on" });
const done = (row: Locator) =>
  row.getByRole("checkbox", { name: / complete$/ });
const state = (row: Locator) => row.locator(".set-save-state");
async function pending(page: Page) {
  const context = await fixture(page),
    row = page.locator(".logged-set").nth(1);
  await row.locator(".set-options > summary").click();
  return { ...context, row };
}
function watchCompletions(page: Page) {
  const commands: unknown[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") {
      try {
        const command = JSON.parse(request.postData() ?? "[]")[0];
        if (command?.operation === "save" && command.completed)
          commands.push(command);
      } catch {}
    }
  });
  return commands;
}
test("invalid Done preserves input and pending evidence without a completion request", async ({
  page,
}, info) => {
  const { row, a } = await pending(page),
    commands = watchCompletions(page),
    id = await row.getAttribute("data-set-id");
  for (const [weight, reps] of [
    ["", "8"],
    ["100", ""],
    ["", ""],
    [" ", " "],
    ["0", "8"],
    ["100", "0"],
    ["-5", "8"],
    ["100", "-1"],
    ["abc", "8"],
    ["100", "abc"],
    ["100", "1.5"],
    ["220463", "8"],
    ["100", "1001"],
  ]) {
    await row.getByRole("textbox", { name: /weight/ }).fill(weight);
    await row.getByRole("textbox", { name: / reps$/ }).fill(reps);
    await expect(done(row)).toBeEnabled();
    await done(row).click();
    await expect(done(row)).not.toBeChecked();
    await expect(state(row)).toHaveText("Check set values");
    await expect(row.locator(".set-field-errors")).not.toBeEmpty();
    await expect(row.locator(".set-options")).toHaveAttribute("open", "");
    await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue(
      weight,
    );
    await expect(row.getByRole("textbox", { name: / reps$/ })).toHaveValue(
      reps,
    );
  }
  expect(commands).toHaveLength(0);
  expect(
    (await a.client.from("workout_sets").select("status").eq("id", id).single())
      .data?.status,
  ).toBe("pending");
  await row.getByRole("textbox", { name: /weight/ }).fill("135");
  await row.getByRole("textbox", { name: / reps$/ }).fill("8");
  await expect(row.locator(".set-field-errors")).toHaveCount(0);
  await done(row).click();
  await expect(state(row)).toHaveText("Saved");
  await expect(done(row)).toBeChecked();
  expect(commands).toHaveLength(1);
  await expect(row.locator(".set-options")).not.toHaveAttribute("open", "");
  await page.screenshot({
    path: info.outputPath("valid-completion.png"),
    fullPage: true,
  });
});
test("clearing suggested reps stays blank after the incomplete blur acknowledgement", async ({
  page,
}) => {
  const { row, a } = await pending(page),
    id = await row.getAttribute("data-set-id");
  await row.getByRole("textbox", { name: / reps$/ }).fill("");
  await row.getByRole("textbox", { name: / reps$/ }).press("Tab");
  await expect(state(row)).toHaveText("Saved");
  await expect(row.getByRole("textbox", { name: / reps$/ })).toHaveValue("");
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("status,actual_reps")
        .eq("id", id)
        .single()
    ).data,
  ).toMatchObject({ status: "pending", actual_reps: null });
  await done(row).click();
  await expect(row.locator(".set-field-errors")).toContainText("Enter reps");
  await expect(done(row)).not.toBeChecked();
});
test("valid completion waits for acknowledgement; repeated taps cannot duplicate it", async ({
  page,
}) => {
  const { row, a } = await pending(page),
    commands = watchCompletions(page),
    id = await row.getAttribute("data-set-id");
  await row.getByRole("textbox", { name: /weight/ }).fill("125");
  await row.getByRole("textbox", { name: / reps$/ }).fill("9");
  let release = () => {},
    arrive = () => {};
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
    if (command?.operation === "save" && command.completed) {
      const response = await route.fetch();
      arrive();
      await gate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await done(row).click();
  await arrived;
  await expect(state(row)).toHaveText("Saving…");
  await expect(done(row)).not.toBeChecked();
  await expect(done(row)).toBeDisabled();
  await expect(row.locator(".set-options")).toHaveAttribute("open", "");
  await done(row).evaluate((element: HTMLInputElement) => {
    for (let i = 0; i < 8; i++) element.click();
  });
  expect(commands).toHaveLength(1);
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("status,actual_reps")
        .eq("id", id)
        .single()
    ).data,
  ).toMatchObject({ status: "completed", actual_reps: 9 });
  release();
  await expect(state(row)).toHaveText("Saved");
  await expect(done(row)).toBeChecked();
  await expect(row.locator(".set-options")).not.toHaveAttribute("open", "");
});
test("server rejection retains a valid local draft and retries through the same command", async ({
  page,
}) => {
  const { row, a } = await pending(page),
    id = await row.getAttribute("data-set-id");
  await row.getByRole("textbox", { name: /weight/ }).fill("125");
  await row.getByRole("textbox", { name: / reps$/ }).fill("8");
  await page.route("**/workout/**", async (route) => {
    let args;
    try {
      args = JSON.parse(route.request().postData() ?? "[]");
    } catch {}
    if (args?.[0]?.operation === "save" && args[0].completed) {
      args[0].weight = null;
      await route.continue({ postData: JSON.stringify(args) });
    } else await route.continue();
  });
  await done(row).click();
  await expect(state(row)).toHaveText("Not saved");
  await expect(done(row)).not.toBeChecked();
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue("125");
  await expect(row.locator(".set-options")).toHaveAttribute("open", "");
  expect(
    (await a.client.from("workout_sets").select("status").eq("id", id).single())
      .data?.status,
  ).toBe("pending");
  await page.unroute("**/workout/**");
  await row.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(state(row)).toHaveText("Saved");
  await expect(done(row)).toBeChecked();
});
test("invalid completed-set correction retains the last authoritative evidence until valid", async ({
  page,
}) => {
  const { row, a } = await fixture(page),
    id = await row.getAttribute("data-set-id"),
    commands = watchCompletions(page);
  const before = await a.client
    .from("workout_sets")
    .select("*")
    .eq("id", id)
    .single();
  await row.locator(".set-options > summary").click();
  await row.getByRole("textbox", { name: /weight/ }).fill("");
  await row.getByRole("textbox", { name: / reps$/ }).fill("");
  await row.getByRole("textbox", { name: / reps$/ }).press("Tab");
  await expect(state(row)).toHaveText("Check set values");
  await expect(done(row)).toBeChecked();
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(commands).toHaveLength(0);
  expect(
    (await a.client.from("workout_sets").select("*").eq("id", id).single())
      .data,
  ).toEqual(before.data);
  await row.getByRole("textbox", { name: /weight/ }).fill("140");
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await expect(row.getByRole("textbox", { name: / reps$/ })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await row.getByRole("textbox", { name: / reps$/ }).fill("10");
  await row.getByRole("textbox", { name: / reps$/ }).press("Tab");
  await expect(state(row)).toHaveText("Saved");
  expect(commands).toHaveLength(1);
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("entered_weight,actual_reps,completed_at")
        .eq("id", id)
        .single()
    ).data,
  ).toMatchObject({
    entered_weight: 140,
    actual_reps: 10,
    completed_at: before.data?.completed_at,
  });
});
test("discarding an invalid completed correction clears feedback and restores only saved values", async ({
  page,
}) => {
  const { row } = await fixture(page);
  await row.locator(".set-options > summary").click();
  await row.getByRole("textbox", { name: /weight/ }).fill("");
  await row.getByRole("textbox", { name: /weight/ }).press("Tab");
  await expect(row.locator(".set-field-errors")).toContainText("Enter weight");
  await row
    .getByRole("button", {
      name: "Discard this draft and use saved values",
      exact: true,
    })
    .click();
  await expect(state(row)).toHaveText("Saved");
  await expect(row.locator(".set-field-errors")).toHaveCount(0);
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue("100");
  await expect(done(row)).toBeChecked();
});
test("bodyweight requires reps, deliberate added resistance requires positive load", async ({
  page,
}) => {
  const a = await verifiedAccount(),
    ex = catalog.exercises.find((e) => e.slug === "push_up");
  if (!ex) throw Error("catalog fixture");
  const start = await a.client.rpc("start_exercise_workout", {
    p_exercises: [ex.id],
    p_request: crypto.randomUUID(),
  });
  expect(start.error).toBeNull();
  const item = await a.client
    .from("workout_exercises")
    .select("id")
    .eq("workout_session_id", start.data)
    .single();
  await loginSelection(page, a);
  await page.goto(`/workout/${start.data}?exercise=${item.data?.id}`);
  const row = page.locator(".logged-set").first();
  await row.getByRole("textbox", { name: / reps$/ }).fill("8");
  await done(row).click();
  await expect(state(row)).toHaveText("Saved · Bodyweight");
  await expect(done(row)).toBeChecked();
  const id = await row.getAttribute("data-set-id");
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("actual_weight_kg,actual_reps")
        .eq("id", id)
        .single()
    ).data,
  ).toEqual({ actual_weight_kg: null, actual_reps: 8 });
  await row.getByRole("button", { name: "+ Add weight", exact: true }).click();
  await expect(state(row)).toHaveText("Saved");
  await expect(done(row)).not.toBeChecked();
  await done(row).click();
  await expect(row.locator(".set-field-errors")).toContainText("Enter weight");
  await expect(done(row)).not.toBeChecked();
  await row.getByRole("textbox", { name: /weight/ }).fill("25");
  await done(row).click();
  await expect(state(row)).toHaveText("Saved");
  await expect(done(row)).toBeChecked();
});

test("mobile invalid feedback stays stable across widths, themes and viewport event storms", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "mobile",
    "One mobile matrix covers all widths/themes",
  );
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 844, offsetTop: 0, width: 390 });
    Object.defineProperty(window, "visualViewport", {
      value: viewport,
      configurable: true,
    });
    let scrollCalls = 0,
      shifts = 0;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      scrollCalls++;
      original.call(this, options);
    };
    new PerformanceObserver((list) => {
      shifts += list.getEntries().length;
    }).observe({ type: "layout-shift", buffered: true });
    Object.assign(window, { p1Stats: () => ({ scrollCalls, shifts }) });
  });
  const { row } = await pending(page),
    commands = watchCompletions(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 125000,
    uploadThroughput: 62500,
  });
  const metrics = [];
  for (const width of [375, 390, 430])
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await row.getByRole("textbox", { name: /weight/ }).fill("");
      await row.getByRole("textbox", { name: / reps$/ }).fill("");
      await row.scrollIntoViewIfNeeded();
      await done(row).click();
      await expect(row.locator(".set-field-errors")).toHaveText(
        "Enter weightEnter reps",
      );
      // One deliberate feedback insertion is expected. Repeating invalid Done must
      // not mount a changing error panel, focus a field or move the fixed footer.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const before = await page.evaluate(() => {
        const w = window as typeof window & {
          p1Stats: () => { scrollCalls: number; shifts: number };
        };
        return {
          ...w.p1Stats(),
          y: scrollY,
          active: document.activeElement?.getAttribute("aria-label"),
        };
      });
      const footer = await page.locator(".workout-mode-controls").boundingBox();
      for (let i = 0; i < 6; i++)
        await done(row).evaluate((el: HTMLInputElement) => el.click());
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => {
        const w = window as typeof window & {
          p1Stats: () => { scrollCalls: number; shifts: number };
        };
        return {
          ...w.p1Stats(),
          y: scrollY,
          active: document.activeElement?.getAttribute("aria-label"),
        };
      });
      expect(after.y).toBe(before.y);
      expect(after.scrollCalls).toBe(before.scrollCalls);
      expect(after.active).toBe(before.active);
      expect(after.shifts).toBe(before.shifts);
      expect(
        await page.locator(".workout-mode-controls").boundingBox(),
      ).toEqual(footer);
      await expect(done(row)).not.toBeChecked();
      await expect(row.locator(".set-options")).toHaveAttribute("open", "");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`invalid-${width}-${theme}.png`),
        fullPage: true,
      });
      metrics.push({
        width,
        theme,
        unexpectedScrollDelta: after.y - before.y,
        repeatedScrollCalls: after.scrollCalls - before.scrollCalls,
        repeatedLayoutShifts: after.shifts - before.shifts,
      });
    }
  await row.getByRole("textbox", { name: / reps$/ }).focus();
  const keyboard = await page.evaluate(async () => {
    const w = window as typeof window & {
        p1Stats: () => { scrollCalls: number; shifts: number };
      },
      before = w.p1Stats().scrollCalls;
    Object.assign(window.visualViewport ?? {}, { height: 400 });
    for (let i = 0; i < 10; i++)
      window.visualViewport?.dispatchEvent(new Event("scroll"));
    const scrollStorm = w.p1Stats().scrollCalls - before;
    for (let i = 0; i < 10; i++)
      window.visualViewport?.dispatchEvent(new Event("resize"));
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    return { scrollStorm, resizeCalls: w.p1Stats().scrollCalls - before };
  });
  expect(keyboard.scrollStorm).toBe(0);
  expect(keyboard.resizeCalls).toBeLessThanOrEqual(1);
  expect(commands).toHaveLength(0);
  const evidence = {
    metrics,
    emulatedKeyboard: keyboard,
    physicalKeyboardVerified: false,
  };
  await writeFile(
    info.outputPath("stability-metrics.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await info.attach("stability-metrics", {
    body: JSON.stringify(evidence),
    contentType: "application/json",
  });
});
