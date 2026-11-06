import { expect, test } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import programs from "../../supabase/catalog/programs.json" with { type: "json" };
test.setTimeout(90000);
test.use({ actionTimeout: 15000 });
async function signIn(page: import("@playwright/test").Page) {
  const account = await verifiedAccount();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  return account;
}
test("official discovery, combined filters, pagination, immutable detail and theme layouts", async ({
  page,
}, info) => {
  const a = await signIn(page);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Programs", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "12 programs found" }),
  ).toBeVisible();
  await expect(page.locator(".program-card")).toHaveCount(6);
  await expect(page.getByText("Popular", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Start Program|Activate/i }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page.locator(".program-pagination")).toContainText(
    "Page 2 of 2",
  );
  await page.getByRole("link", { name: "Previous page" }).click();
  await expect(page.locator(".program-pagination")).toContainText(
    "Page 1 of 2",
  );
  const filters = page.getByRole("form", { name: "Program filters" });
  for (const [name, value, count] of [
    ["Goal", "strength", 2],
    ["Split", "ppl", 1],
    ["Experience", "advanced", 2],
    ["Equipment", "dumbbells", 1],
    ["Training frequency", "5_6", 3],
    ["Style", "low_volume", 1],
  ] as const) {
    await filters.locator("summary").click();
    await filters
      .getByRole("combobox", { name, exact: true })
      .selectOption(value);
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await expect(
      page.getByRole("status").filter({
        hasText: `${count} ${count === 1 ? "program" : "programs"} found`,
      }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Reset filters", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "12 programs found" }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: info.outputPath("program-library.png"),
    animations: "disabled",
    caret: "initial",
  });
  await filters.locator("summary").click();
  await filters
    .getByRole("combobox", { name: "Goal", exact: true })
    .selectOption("strength_size");
  await filters
    .getByRole("combobox", { name: "Split", exact: true })
    .selectOption("full_body");
  await filters
    .getByRole("combobox", { name: "Experience", exact: true })
    .selectOption("beginner");
  await filters
    .getByRole("combobox", { name: "Equipment", exact: true })
    .selectOption("dumbbells");
  await filters
    .getByRole("combobox", { name: "Training frequency", exact: true })
    .selectOption("2_3");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator(".program-card")).toHaveCount(1);
  await expect(page.locator(".program-card h2")).toHaveText(
    "Dumbbell-Only Full Body",
  );
  await page
    .getByRole("link", { name: "Reset filters", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "12 programs found" }),
  ).toBeVisible();
  await filters.getByLabel("Search programs").fill("Powerbuilding");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator(".program-card h2")).toHaveText("Powerbuilding");
  await page
    .getByRole("link", { name: "Reset filters", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "12 programs found" }),
  ).toBeVisible();
  await filters.getByLabel("Search programs").fill("zzzzdoesnotexist");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByRole("heading", { name: "No programs match yet" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Reset filters", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "12 programs found" }),
  ).toBeVisible();
  const p = programs.find((p) => p.slug === "push-pull-legs")!;
  await page.goto(`/programs/${p.id}`);
  await expect(
    page.getByRole("heading", { name: "Push / Pull / Legs", exact: true }),
  ).toBeVisible();
  await page.getByText("About this program", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Who it suits" }),
  ).toBeVisible();
  await expect(page.locator(".program-days > li")).toHaveCount(8);
  await expect(page.locator(".program-rest-day")).toHaveCount(2);
  await expect(page.locator(".program-prescriptions").first()).toContainText(
    "Target RIR",
  );
  await expect(page.locator(".program-detail")).toContainText(
    "Progression: build reps",
  );
  await expect(page.locator(".program-detail")).toContainText(
    "Prescriptions describe planned work",
  );
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".program-detail > header").screenshot({
      path: info.outputPath(`program-${colorScheme}.png`),
      animations: "disabled",
      caret: "initial",
    });
  }
  const tamper = await a.client
    .from("programs")
    .update({ summary: "Tampered" })
    .eq("id", p.id)
    .select("id");
  expect(tamper.error).toBeNull();
  expect(tamper.data).toEqual([]);
  await page.reload();
  await expect(page.locator("main")).not.toContainText("Tampered");
});
test("missing images recover, approved content remains read-only and private programs stay private", async ({
  page,
}) => {
  const a = await signIn(page);
  const p = programs.find((p) => p.slug === "dumbbell-only-full-body")!;
  await page.route("**/media/programs/dumbbell-only-full-body.svg", (route) =>
    route.abort(),
  );
  await page.goto(`/programs/${p.id}`);
  await expect(page.locator(".program-cover")).toHaveAttribute(
    "src",
    "/media/programs/fallback.svg",
  );
  await expect(page.locator(".program-cover")).toHaveAttribute(
    "alt",
    /Original Body/,
  );
  await expect(page.locator("main")).toContainText("Dumbbell");
  await expect(page.locator("main")).toContainText("Open-ended");
  await expect(page.getByRole("button", { name: /Start Workout/ })).toHaveCount(
    3,
  );
  await expect(page.locator("main script, main iframe")).toHaveCount(0);
  const privateId = crypto.randomUUID();
  expect(
    (
      await a.client.from("programs").insert({
        id: privateId,
        owner_id: a.userId,
        name: "Private draft",
        cycle_length: 3,
        visibility: "public",
      })
    ).error,
  ).toBeNull();
  const b = await verifiedAccount();
  expect(
    (await b.client.from("programs").select("id").eq("id", privateId)).data,
  ).toEqual([]);
  await page.goto(`/programs/${privateId}`);
  await expect(
    page.getByRole("heading", { name: /could not be found/i }),
  ).toBeVisible();
  const bad = await a.client
    .from("programs")
    .update({ featured: true })
    .eq("id", p.id);
  expect(bad.error).not.toBeNull();
});
