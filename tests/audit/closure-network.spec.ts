import { expect, test } from "@playwright/test";
import { fixture } from "./helpers";
import { openWorkoutEnding } from "../e2e/workout-screen-helpers";
for (const outcome of ["completed", "abandoned"] as const) {
  test(`${outcome} closure rejects a failed transport without losing committed sets`, async ({
    page,
  }, info) => {
    const { a, session, item } = await fixture(page);
    let attempts = 0;
    await page.route("**/workout/**", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postData()?.includes("outcome")
      ) {
        attempts++;
        await route.abort("failed");
      } else await route.continue();
    });
    if (outcome === "completed") {
      await openWorkoutEnding(page);
      const dialog = page.getByRole("dialog", { name: "End workout?" });
      await dialog
        .getByRole("checkbox", { name: /Finish without completing/ })
        .check();
      await dialog
        .getByRole("button", { name: "Finish workout", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "could not be closed",
      );
    } else {
      await page.getByRole("button", { name: "Abandon", exact: true }).click();
      await page
        .getByRole("button", { name: "Confirm Abandon", exact: true })
        .click();
      await expect(
        page.getByRole("alert").filter({ hasText: "could not be closed" }),
      ).toBeVisible();
    }
    expect(attempts).toBe(1);
    expect(
      (
        await a.client
          .from("workout_sessions")
          .select("status")
          .eq("id", session)
          .single()
      ).data?.status,
    ).toBe("in_progress");
    expect(
      (
        await a.client
          .from("workout_sets")
          .select("id")
          .eq("workout_exercise_id", item)
          .eq("status", "completed")
      ).data,
    ).toHaveLength(1);
    await page.screenshot({
      path: info.outputPath(`failed-${outcome}.png`),
      fullPage: true,
    });
    await page.unroute("**/workout/**");
    if (outcome === "completed")
      await page
        .getByRole("dialog", { name: "End workout?" })
        .getByRole("button", { name: "Finish workout", exact: true })
        .click();
    else
      await page
        .getByRole("button", { name: "Confirm Abandon", exact: true })
        .click();
    await expect
      .poll(
        async () =>
          (
            await a.client
              .from("workout_sessions")
              .select("status")
              .eq("id", session)
              .single()
          ).data?.status,
      )
      .toBe(outcome);
    expect(
      (
        await a.client
          .from("workout_sets")
          .select("id")
          .eq("workout_exercise_id", item)
          .eq("status", "completed")
      ).data,
    ).toHaveLength(1);
  });
}
