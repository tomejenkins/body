import { expect, test } from "@playwright/test";
import {
  credentials,
  emailLink,
  localAuth,
  verifiedAccount,
  ageSession,
} from "./auth-helpers";
test.setTimeout(120000);
test("registration, email verification, onboarding, persistent session and logout", async ({
  page,
}) => {
  localAuth();
  const account = credentials();
  await page.goto("/history?range=30");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Make room for progress." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("Confirm password").fill(account.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.goto(await emailLink(account.email, "signup"));
  await expect(page).toHaveURL(/\/onboarding\?next=%2Fhistory/);
  await page.getByLabel("What should we call you?").fill("Local athlete");
  await page
    .getByRole("button", { name: "Continue to your training space" })
    .click();
  await expect(page).toHaveURL(/\/history\?range=30$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Workout history" }),
  ).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Local athlete", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?message=signed-out$/);
  await page.goto("/history");
  await expect(page).toHaveURL(/\/login\?next=%2Fhistory$/);
});
test("failed login, partial profile retry, RLS isolation and unsafe destination rejection", async ({
  page,
}) => {
  const account = await verifiedAccount({ partial: true });
  const other = await verifiedAccount();
  const read = await account.client
    .from("profiles")
    .select("id")
    .eq("id", other.userId);
  expect(read.error).toBeNull();
  expect(read.data).toEqual([]);
  const update = await account.client
    .from("account_preferences")
    .update({ preferred_split: "forged" })
    .eq("owner_id", other.userId)
    .select("owner_id");
  expect(update.error).toBeNull();
  expect(update.data).toEqual([]);
  const forged = await account.client
    .from("profiles")
    .insert({ id: other.userId, display_name: "Forged" });
  expect(forged.error?.code).toBe("42501");
  await page.goto("/login?next=https://evil.example");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".auth-error")).toContainText("Sign-in failed");
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByLabel("What should we call you?")).toHaveValue(
    "Test athlete",
  );
  await page
    .getByRole("button", { name: "Continue to your training space" })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const pref = await account.client
    .from("account_preferences")
    .select("owner_id")
    .eq("owner_id", account.userId)
    .single();
  expect(pref.error).toBeNull();
  await ageSession(page);
  const refreshed = await page.reload();
  await expect(
    page.getByRole("heading", { name: "Show up for yourself." }),
  ).toBeVisible();
  expect(refreshed?.headers()["cache-control"]).toContain("no-store");
  await ageSession(page, true);
  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=/);
});
test("password recovery email, update, old password rejection and new password login", async ({
  page,
}) => {
  const account = await verifiedAccount();
  const replacement = credentials().password;
  await page.goto("/reset-password");
  await expect(page.locator(".auth-error")).toContainText("missing or expired");
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  await page.goto(await emailLink(account.email, "recovery"));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("Password", { exact: true }).fill(replacement);
  await page.getByLabel("Confirm password").fill(replacement);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?message=password-updated$/);
  const old = await localAuth().auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  expect(old.error).not.toBeNull();
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(replacement);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
test("invalid callbacks fail safely and auth pages follow system theme", async ({
  page,
}) => {
  await page.goto("/auth/callback?code=invalid&next=//evil.example");
  await expect(page).toHaveURL(/\/login\?error=callback$/);
  await expect(page.locator(".auth-error")).toContainText("invalid, expired");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(18, 21, 18)",
  );
  await page.goto("/signup");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
