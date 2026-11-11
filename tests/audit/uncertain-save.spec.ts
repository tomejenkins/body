import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fixture } from "./helpers";

test("uncertain save captures exact retry identity and protects later device writes", async ({
  page,
}, info) => {
  const { a, row } = await fixture(page);
  const id = await row.getAttribute("data-set-id");
  const requests: { mutation: string; revision: number }[] = [];
  let dropped = false;
  await page.route("**/workout/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      try {
        const data = JSON.parse(request.postData() ?? "[]")[0];
        if (data?.operation === "save")
          requests.push({ mutation: data.mutation, revision: data.revision });
      } catch {
        /* continuity actions have no command */
      }
      if (!dropped) {
        dropped = true;
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await row.getByRole("textbox", { name: /weight/ }).fill("145");
  await row.getByRole("textbox", { name: /weight/ }).press("Tab");
  await expect(row.locator(".set-save-state")).toHaveText("Not saved");
  const committed = await a.client
    .from("workout_sets")
    .select("*")
    .eq("id", id)
    .single();
  expect(Number(committed.data?.entered_weight)).toBe(145);
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
  const conflict = await row
    .getByRole("button", { name: "Use saved version", exact: true })
    .isVisible();
  await writeFile(
    info.outputPath("retry-identity.json"),
    JSON.stringify(
      {
        requests: requests.length,
        uniqueMutations: new Set(requests.map((r) => r.mutation)).size,
        revisions: requests.map((r) => r.revision),
        conflict,
      },
      null,
      2,
    ),
  );
  if (process.env.BODY_EXPECT_RETRY_FIX === "1") {
    expect(conflict).toBe(false);
    expect(new Set(requests.map((r) => r.mutation)).size).toBe(1);
    await expect(row.locator(".set-save-state")).toHaveText("Saved");
  } else if (conflict) {
    await row
      .getByRole("button", { name: "Use saved version", exact: true })
      .click();
  }
  await page.unroute("**/workout/**");
  const current = await a.client
    .from("workout_sets")
    .select("*")
    .eq("id", id)
    .single();
  expect(current.data?.revision).toBe(committed.data?.revision);
  // A later actual device edit must still be reviewed, never overwritten by retry.
  let lost = false;
  await page.route("**/workout/**", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await row.getByRole("textbox", { name: /weight/ }).fill("150");
  await row.getByRole("textbox", { name: /weight/ }).press("Tab");
  await expect(row.locator(".set-save-state")).toHaveText("Not saved");
  const remote = await a.client
    .from("workout_sets")
    .select("*")
    .eq("id", id)
    .single();
  const edit = await a.client.rpc("log_workout_set", {
    p_item: remote.data.workout_exercise_id,
    p_id: id,
    p_operation: "save",
    p_revision: remote.data.revision,
    p_mutation: crypto.randomUUID(),
    p_reps: 8,
    p_weight: 90,
    p_type: "working",
    p_mode: "external",
    p_completed: true,
    p_entered_weight: 90,
    p_entered_unit: "kg",
  });
  expect(edit.error).toBeNull();
  await page.unroute("**/workout/**");
  await row.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Use saved version", exact: true }),
  ).toBeVisible();
  await expect(row.getByRole("textbox", { name: /weight/ })).toHaveValue("150");
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
  ).toBe(90);
});
