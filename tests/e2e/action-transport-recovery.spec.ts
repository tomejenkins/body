import { expect, test, type Page } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import { selectionProgram, loginSelection } from "./selection-helpers";
import { enrollFixture } from "./enrollment-helpers";
import { fixture } from "../audit/helpers";
test.setTimeout(120000);
async function drop(page: Page, committed: boolean) {
  let dropped = false;
  await page.route("**/*", async (route) => {
    if (
      !dropped &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      dropped = true;
      if (committed) await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
}
for (const committed of [false, true]) {
  test(`switch transport ${committed ? "after commit" : "before commit"} preserves one transition and retry`, async ({
    page,
  }) => {
    const a = await verifiedAccount(),
      old = await selectionProgram(a, 4, 2, false, true, false),
      next = await selectionProgram(a, 4, 2, false, true, false),
      oldId = await enrollFixture(a, old.version);
    await loginSelection(page, a);
    await page.goto(`/programs/enroll?version=${next.version}`);
    await page
      .getByLabel(
        "Confirm switching programs. My existing history will be kept.",
      )
      .check();
    const request = await page.locator("input[name=request]").inputValue();
    await drop(page, committed);
    await page
      .getByRole("button", { name: "Switch Program", exact: true })
      .click();
    await expect(
      page.locator(".program-lifecycle-form").getByRole("alert"),
    ).toContainText("could not be confirmed");
    await expect(
      page.getByRole("button", { name: "Switch Program", exact: true }),
    ).toBeEnabled();
    expect(await page.locator("input[name=request]").inputValue()).toBe(
      request,
    );
    const beforeRetry = await a.client
      .from("program_assignments")
      .select("id,state,source_version_id")
      .eq("owner_id", a.userId);
    expect(beforeRetry.error).toBeNull();
    expect(beforeRetry.data?.filter((r) => r.state === "active")).toHaveLength(
      1,
    );
    expect(beforeRetry.data?.find((r) => r.id === oldId)?.state).toBe(
      committed ? "archived" : "active",
    );
    await page.unroute("**/*");
    await page
      .getByRole("button", { name: "Switch Program", exact: true })
      .click();
    await expect(page).toHaveURL(/programs\/current$/);
    const after = await a.client
      .from("program_assignments")
      .select("id,state,source_version_id")
      .eq("owner_id", a.userId);
    expect(after.data).toHaveLength(2);
    expect(after.data?.filter((r) => r.state === "active")).toHaveLength(1);
    expect(
      after.data?.find((r) => r.state === "active")?.source_version_id,
    ).toBe(next.version);
  });
  test(`archive transport ${committed ? "after commit" : "before commit"} retains confirmation and receipt`, async ({
    page,
  }) => {
    const { a, session } = await fixture(page);
    expect(
      (
        await a.client.rpc("end_workout", {
          p_session: session,
          p_outcome: "completed",
        })
      ).error,
    ).toBeNull();
    await page.goto(`/history/${session}`);
    const manage = page.getByRole("region", { name: "Manage Workout" });
    await manage
      .getByRole("button", { name: "Archive Workout", exact: true })
      .click();
    await manage.getByRole("checkbox").check();
    const request = await manage.locator("input[name=request]").inputValue();
    await drop(page, committed);
    await manage
      .getByRole("button", { name: "Confirm Archive", exact: true })
      .click();
    await expect(manage.getByRole("alert")).toContainText(
      "could not be confirmed",
    );
    await expect(manage.getByRole("checkbox")).toBeChecked();
    expect(await manage.locator("input[name=request]").inputValue()).toBe(
      request,
    );
    const before = await a.client
      .from("workout_sessions")
      .select("archived_at,retention_revision")
      .eq("id", session)
      .single();
    expect(!!before.data?.archived_at).toBe(committed);
    await page.unroute("**/*");
    await manage
      .getByRole("button", { name: "Confirm Archive", exact: true })
      .click();
    await expect(
      page.getByText("Archived Workout", { exact: true }),
    ).toBeVisible();
    const after = await a.client
      .from("workout_sessions")
      .select("archived_at,retention_revision")
      .eq("id", session)
      .single();
    expect(after.data?.retention_revision).toBe(
      committed
        ? before.data?.retention_revision
        : Number(before.data?.retention_revision) + 1,
    );
  });
}
