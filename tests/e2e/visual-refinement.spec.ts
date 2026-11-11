import { test, expect } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import {
  selectionProgram,
  completeSelection,
  loginSelection,
} from "./selection-helpers";
test.setTimeout(180000);
test("visual surfaces retain actual enrollment and training evidence", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "One matrix includes all mobile sizes",
  );
  const a = await verifiedAccount();
  await loginSelection(page, a);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("region", { name: "Your Training Week", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("dashboard-empty.png"),
    animations: "disabled",
  });
  const p = await selectionProgram(a, 4, 2);
  await completeSelection(a, p.session, p.exercise, [8, 8]);
  const assignment = (await a.client.rpc("program_schedule")).data.assignmentId;
  const official = (
    await a.client
      .from("programs")
      .select("id")
      .eq("slug", "upper-lower-strength-size")
      .single()
  ).data!.id;
  const routes = [
    ["dashboard", "/dashboard"],
    ["programs", "/programs"],
    ["current", "/programs/current"],
    ["history", "/history"],
    ["program-history", "/history/programs"],
    ["enrollment", `/history/programs/${assignment}`],
    ["workout-detail", `/history/${p.session}`],
    ["program-detail", `/programs/${official}`],
    ["complete", `/workout/${p.session}/complete`],
    ["workout-entry", "/workout"],
  ];
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
      for (const [name, url] of routes) {
        await page.goto(url);
        const ready: Record<string, string> = {
          dashboard: ".home-screen .training-week",
          programs: ".program-card-grid",
          current: ".enrollment-card",
          history: ".history-list",
          "program-history": ".enrollment-history",
          enrollment: ".enrollment-details",
          "workout-detail": ".performance-list",
          "program-detail": ".program-overview",
          complete: ".workout-completion",
          "workout-entry": ".recommended-workout",
        };
        await expect(page.locator(ready[name]).first()).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (
          width === 390 ||
          width === 1440 ||
          name === "dashboard" ||
          name === "history"
        )
          await page.screenshot({
            path: info.outputPath(`${name}-${width}-${colorScheme}.png`),
            animations: "disabled",
          });
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/programs/current?manage=1#manage-program");
  await expect(
    page.getByRole("dialog", { name: "Manage Program", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("manage-program-direct.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  for (const url of [
    "/dashboard",
    "/programs",
    "/history",
    "/history/programs",
  ]) {
    await page.goto(url);
    await expect(page.locator(".refined-screen")).toBeVisible();
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`large-text-${url.replaceAll("/", "-")}.png`),
      animations: "disabled",
    });
    await page.evaluate(() =>
      document.documentElement.style.removeProperty("font-size"),
    );
  }
  const revision = (
    await a.client
      .from("workout_sessions")
      .select("retention_revision")
      .eq("id", p.session)
      .single()
  ).data!.retention_revision;
  expect(
    (
      await a.client.rpc("retain_workout", {
        p_session: p.session,
        p_kind: "archive",
        p_expected: revision,
        p_request: crypto.randomUUID(),
      })
    ).error,
  ).toBeNull();
  await page.goto("/history?filter=archived");
  await expect(page.locator(".history-list")).toContainText("Archived");
  await page.screenshot({
    path: info.outputPath("archived-history.png"),
    animations: "disabled",
  });
});
