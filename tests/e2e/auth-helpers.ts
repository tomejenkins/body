import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
export function localAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "Auth browser tests require a configured local Supabase stack.",
    );
  const target = new URL(url);
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.port !== "54321"
  )
    throw new Error(
      "Refusing to create test users outside local Supabase port 54321.",
    );
  const app = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://invalid");
  if (
    app.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(app.hostname) ||
    !["3000", "8787"].includes(app.port)
  )
    throw new Error(
      "Auth browser tests require a local canonical application origin.",
    );
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export function credentials() {
  return {
    email: `body-${randomUUID()}@example.test`,
    password: `Local-${randomUUID()}!`,
  };
}
type MailMessage = { ID: string; To: { Address: string }[] };
export async function emailLink(email: string, type: "signup" | "recovery") {
  localAuth(); // Always enforce the local-only boundary before reading a test inbox.
  let found: string | undefined;
  await expect
    .poll(
      async () => {
        const list = (await (
          await fetch("http://127.0.0.1:54324/api/v1/messages")
        ).json()) as { messages: MailMessage[] };
        for (const message of list.messages.filter((m) =>
          m.To.some((to) => to.Address === email),
        )) {
          const body = (await (
            await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)
          ).json()) as { HTML?: string; Text?: string };
          const links =
            ((body.HTML ?? "") + " " + (body.Text ?? ""))
              .replaceAll("&amp;", "&")
              .match(/https?:\/\/[^\s"'<>]+/g) ?? [];
          found = links.find((link) => {
            try {
              const u = new URL(link);
              return (
                ["127.0.0.1", "localhost"].includes(u.hostname) &&
                u.port === "54321" &&
                u.pathname === "/auth/v1/verify" &&
                u.searchParams.get("type") === type
              );
            } catch {
              return false;
            }
          });
          if (found) return true;
        }
        return false;
      },
      {
        timeout: 45000,
        message: "Expected a local test confirmation/recovery email",
      },
    )
    .toBe(true);
  if (!found)
    throw new Error("Local test email had no usable verification link");
  return found;
}
export async function verifiedAccount({
  partial = false,
}: { partial?: boolean } = {}) {
  const client = localAuth();
  const account = credentials();
  const signup = await client.auth.signUp({
    ...account,
    options: {
      emailRedirectTo: process.env.NEXT_PUBLIC_SITE_URL + "/auth/callback",
    },
  });
  if (signup.error) throw new Error("Local test signup failed");
  const link = new URL(await emailLink(account.email, "signup"));
  const tokenHash = link.searchParams.get("token");
  if (!tokenHash) throw new Error("Missing local confirmation token hash");
  const verified = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: "signup",
  });
  if (verified.error || !verified.data.user)
    throw new Error("Local test email verification failed");
  const userId = verified.data.user.id;
  const profile = await client
    .from("profiles")
    .insert({ id: userId, display_name: "Test athlete" });
  if (profile.error) throw new Error("Local profile RLS preflight failed");
  if (!partial) {
    const pref = await client
      .from("account_preferences")
      .insert({ owner_id: userId });
    if (pref.error) throw new Error("Local preference RLS preflight failed");
  }
  return { ...account, client, userId };
}
let cachedAccount: ReturnType<typeof verifiedAccount> | undefined;
export async function loginForNavigation(page: Page) {
  cachedAccount ??= verifiedAccount();
  const account = await cachedAccount;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return account;
}
// Exercise real refresh without signing tokens or using an administrative key.
// Only expiry metadata is aged; the legitimate local refresh token still has to validate.
export async function ageSession(page: Page, invalidateRefresh = false) {
  localAuth();
  const pieces = (await page.context().cookies())
    .filter((c) => /^sb-.*-auth-token(?:\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!pieces.length) throw new Error("No local SSR session cookie to test");
  const raw = pieces.map((c) => c.value).join("");
  if (!raw.startsWith("base64-"))
    throw new Error("Unexpected local SSR cookie encoding");
  const session = JSON.parse(
    Buffer.from(raw.slice(7), "base64url").toString(),
  ) as { expires_at: number; refresh_token: string };
  session.expires_at = 1;
  if (invalidateRefresh) session.refresh_token = "invalid-local-test-refresh";
  const encoded =
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const base = pieces[0].name.replace(/\.\d+$/, "");
  await page.context().clearCookies({ name: /^sb-.*-auth-token(?:\.\d+)?$/ });
  const chunks: { name: string; value: string }[] = [];
  for (let i = 0; i < encoded.length; i += 3180)
    chunks.push({
      name: encoded.length > 3180 ? `${base}.${chunks.length}` : base,
      value: encoded.slice(i, i + 3180),
    });
  await page.context().addCookies(chunks.map((c) => ({ ...pieces[0], ...c })));
}
