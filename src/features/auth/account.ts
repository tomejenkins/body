import type { SupabaseClient } from "@supabase/supabase-js";
export class AccountSetupError extends Error {}
export type Profile = { id: string; display_name: string };
export async function readAccount(client: SupabaseClient, userId: string) {
  const profile = await client
    .from("profiles")
    .select("id,display_name")
    .eq("id", userId)
    .maybeSingle<Profile>();
  if (profile.error)
    throw new AccountSetupError(
      "Your profile could not be loaded. Please retry.",
    );
  const preferences = await client
    .from("account_preferences")
    .select("owner_id")
    .eq("owner_id", userId)
    .maybeSingle<{ owner_id: string }>();
  if (preferences.error)
    throw new AccountSetupError(
      "Your preferences could not be loaded. Please retry.",
    );
  return { profile: profile.data, ready: !!(profile.data && preferences.data) };
}
// userId must come from server-verified auth.getUser(), never form input or metadata.
export async function initializeAccount(
  client: SupabaseClient,
  userId: string,
  displayName: string,
) {
  const name = displayName.trim();
  if (!name || name.length > 120)
    throw new AccountSetupError("Enter a display name of 1–120 characters.");
  let account = await readAccount(client, userId);
  if (!account.profile) {
    const result = await client
      .from("profiles")
      .insert({ id: userId, display_name: name });
    if (result.error && result.error.code !== "23505")
      throw new AccountSetupError(
        "Your profile could not be saved. You are still signed in; please retry.",
      );
    account = await readAccount(client, userId);
    if (!account.profile)
      throw new AccountSetupError(
        "Your profile could not be loaded. Please retry.",
      );
  }
  if (!account.ready) {
    const result = await client
      .from("account_preferences")
      .insert({ owner_id: userId });
    if (result.error && result.error.code !== "23505")
      throw new AccountSetupError(
        "Your preferences could not be saved. Your profile is safe; please retry.",
      );
    account = await readAccount(client, userId);
    if (!account.ready)
      throw new AccountSetupError("Account setup is incomplete. Please retry.");
  }
  return account;
}
