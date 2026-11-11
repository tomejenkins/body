import { expect, test } from "@playwright/test";
import { fixture } from "./helpers";
test("offline draft and committed-but-unacknowledged save retry without duplicate evidence", async ({
  page,
}, info) => {
  const { a, row, item, session } = await fixture(page);
  const id = await row.getAttribute("data-set-id");
  if (!id) throw Error("Missing saved identity");
  const before = await a.client
    .from("workout_sessions")
    .select("started_at,manual_pause_intervals")
    .eq("id", session)
    .single();
  await page.context().setOffline(true);
  await row.getByRole("textbox", { name: /weight/ }).fill("140");
  await row.getByRole("textbox", { name: /weight/ }).press("Tab");
  await expect(row.locator(".set-save-state")).toHaveText("Not saved");
  expect(
    Number(
      (
        await a.client
          .from("workout_sets")
          .select("entered_weight")
          .eq("id", id)
          .single()
      ).data?.entered_weight,
    ),
  ).toBe(100);
  await page.context().setOffline(false);
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue("140");
  await expect(row.locator(".set-error")).toContainText(/recovered/i);
  await row.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  const saved = await a.client
    .from("workout_sets")
    .select("revision")
    .eq("id", id)
    .single();
  let dropped = false;
  await page.route("**/workout/**", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await row.getByRole("textbox", { name: /weight/ }).fill("145");
  await row.getByRole("textbox", { name: /weight/ }).press("Tab");
  await expect(row.locator(".set-save-state")).toHaveText("Not saved");
  const committed = await a.client
    .from("workout_sets")
    .select("revision,entered_weight")
    .eq("id", id)
    .single();
  expect(Number(committed.data?.entered_weight)).toBe(145);
  expect(committed.data?.revision).toBe(Number(saved.data?.revision) + 1);
  await page.unroute("**/workout/**");
  await row.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await row.locator(".set-save-state").textContent()) === "Saved" ||
        (await row
          .getByRole("button", { name: "Use saved version", exact: true })
          .isVisible()),
    )
    .toBe(true);
  const conflictReview = await row
    .getByRole("button", { name: "Use saved version", exact: true })
    .isVisible();
  await info.attach("uncertain-retry-observation", {
    body: JSON.stringify({ conflictReview }),
    contentType: "application/json",
  });
  if (conflictReview) {
    await page.screenshot({
      path: info.outputPath("uncertain-retry-conflict.png"),
      fullPage: true,
    });
    await row
      .getByRole("button", { name: "Use saved version", exact: true })
      .click();
  }
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("revision")
        .eq("id", id)
        .single()
    ).data?.revision,
  ).toBe(committed.data?.revision);
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("id")
        .eq("workout_exercise_id", item)
    ).data,
  ).toHaveLength(3);
  expect(
    (
      await a.client
        .from("workout_sessions")
        .select("started_at,manual_pause_intervals")
        .eq("id", session)
        .single()
    ).data,
  ).toEqual(before.data);
});
test("pending response, repeated completion taps and refresh preserve one ordered actual set", async ({
  page,
}) => {
  const { a, row, item } = await fixture(page);
  let release = () => {};
  let arrived = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let intercepted = false;
  await page.route("**/workout/**", async (route) => {
    if (route.request().method() === "POST" && !intercepted) {
      intercepted = true;
      const response = await route.fetch();
      arrived();
      await gate;
      try {
        await route.fulfill({ response });
      } catch {
        /* navigation may cancel delivery */
      }
      return;
    }
    await route.continue();
  });
  const complete = row.getByRole("checkbox", { name: / complete$/ });
  await complete.click();
  await held;
  await expect(row.locator(".set-save-state")).toHaveText("Saving…");
  await expect(complete).toBeDisabled();
  await complete.evaluate((el: HTMLInputElement) => {
    el.click();
    el.click();
    el.click();
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  release();
  await page.unroute("**/workout/**");
  await expect(row.locator(".set-error")).toContainText(/recovered/i);
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue("100");
  // The DB commit is known; existing recovery requires explicit review of the new server revision.
  await row
    .getByRole("button", { name: "Use saved version", exact: true })
    .click();
  await expect(row.locator(".set-save-state")).toHaveText("Saved");
  const sets = await a.client
    .from("workout_sets")
    .select("id,position,status,actual_reps,entered_weight")
    .eq("workout_exercise_id", item)
    .order("position");
  expect(sets.data).toHaveLength(3);
  expect(sets.data?.map((s) => s.position)).toEqual([1, 2, 3]);
  expect(sets.data?.[0].status).toBe("pending");
  expect(sets.data?.[0].actual_reps).toBe(8);
  expect(Number(sets.data?.[0].entered_weight)).toBe(100);
});
