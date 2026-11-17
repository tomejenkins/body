import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { localAuth, verifiedAccount } from "./auth-helpers";
import { loginSelection } from "./selection-helpers";
function sql(value: string) {
  localAuth();
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_body",
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: value, stdio: ["pipe", "pipe", "pipe"] },
  );
}
test("Premium unavailable state, transparent pricing and accessible responsive controls", async ({
  page,
}, info) => {
  const account = await verifiedAccount();
  await loginSelection(page, account);
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({
      colorScheme: width === 390 ? "dark" : "light",
      reducedMotion: "reduce",
    });
    await page.goto("/access");
    await expect(
      page.getByRole("heading", { name: "Keep building your strength." }),
    ).toBeVisible();
    await expect(page.getByText("Monthly · $6.99 / month")).toBeVisible();
    await expect(page.getByText("Annual · $49.99 / year")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue to Secure Checkout" }),
    ).toBeDisabled();
    await expect(
      page.getByText(/Billing is not available in this environment yet/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (info.project.name === "mobile")
      await page.screenshot({
        path: `docs/screenshots/phase-7-7f-premium-${width}.png`,
        fullPage: true,
      });
  }
  await page.addStyleTag({ content: "html {font-size:200%}" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Refresh Billing Status" }).focus();
  await expect(
    page.getByRole("button", { name: "Refresh Billing Status" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Refresh Billing Status" }).click();
  await expect(
    page.getByText(/Confirmation is temporarily unavailable/),
  ).toBeVisible();
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "Workout history", exact: true }),
  ).toBeVisible();
});
test("forged success return never grants Premium, lifetime avoids accidental purchase", async ({
  page,
}) => {
  const account = await verifiedAccount();
  await loginSelection(page, account);
  const before = (await account.client.rpc("account_access")).data;
  await page.goto("/access/return?session_id=cs_test_someoneElse&paid=true");
  await expect(
    page.getByRole("heading", { name: "Confirming your billing status" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh Billing Status" }).click();
  await expect(
    page.getByText(/Confirmation is temporarily unavailable/),
  ).toBeVisible();
  expect((await account.client.rpc("account_access")).data.source).toBe(
    "trial",
  );
  expect((await account.client.rpc("account_access")).data.trialExpiresAt).toBe(
    before.trialExpiresAt,
  );
  expect(account.userId).toMatch(/^[a-f0-9-]{36}$/);
  sql(
    `insert into body_private.access_grants(owner_id,kind,source,source_reference,valid_from,expires_at) values('${account.userId}','lifetime','local-browser-fixture','${account.userId}',clock_timestamp(),null);`,
  );
  await page.goto("/access");
  await expect(
    page.getByRole("heading", { name: "Lifetime Access" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to Secure Checkout" }),
  ).toHaveCount(0);
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Lifetime Access" }),
  ).toBeVisible();
});
test("billing routes preserve authenticated return destinations", async ({
  page,
}) => {
  await page.goto("/access");
  await expect(page).toHaveURL(/login\?next=%2Faccess/);
});
