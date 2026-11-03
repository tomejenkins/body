import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initializeAccount, AccountSetupError } from "./account";
type Result = { data: unknown; error: { code?: string } | null };
const profile = { id: "verified-user", display_name: "Saved name" };
const pref = { owner_id: "verified-user" };
function fixture(
  profiles: Result[],
  preferences: Result[],
  profileInsert: Result = { data: null, error: null },
  prefInsert: Result = { data: null, error: null },
) {
  const insertProfile = vi.fn().mockResolvedValue(profileInsert),
    insertPreferences = vi.fn().mockResolvedValue(prefInsert);
  const builder = (queue: Result[], insert: typeof insertProfile) => {
    const maybeSingle = vi.fn(async () => {
      const value = queue.shift();
      if (!value) throw new Error("Unexpected read");
      return value;
    });
    return { select: () => ({ eq: () => ({ maybeSingle }) }), insert };
  };
  const p = builder(profiles, insertProfile),
    a = builder(preferences, insertPreferences);
  const client = {
    from: (name: string) => (name === "profiles" ? p : a),
  } as unknown as SupabaseClient;
  return { client, insertProfile, insertPreferences };
}
const value = (data: unknown): Result => ({ data, error: null });
describe("idempotent account provisioning", () => {
  it("creates profile and preferences with verified identifiers and permitted insert columns", async () => {
    const f = fixture(
      [value(null), value(profile), value(profile)],
      [value(null), value(null), value(pref)],
    );
    expect(
      (await initializeAccount(f.client, profile.id, "New name")).ready,
    ).toBe(true);
    expect(f.insertProfile).toHaveBeenCalledWith({
      id: profile.id,
      display_name: "New name",
    });
    expect(f.insertPreferences).toHaveBeenCalledWith({ owner_id: profile.id });
  });
  it("does not overwrite an existing profile or preference", async () => {
    const f = fixture([value(profile)], [value(pref)]);
    expect(
      (await initializeAccount(f.client, profile.id, "Different name")).profile
        ?.display_name,
    ).toBe("Saved name");
    expect(f.insertProfile).not.toHaveBeenCalled();
    expect(f.insertPreferences).not.toHaveBeenCalled();
  });
  it("finishes a partially initialized account on retry", async () => {
    const f = fixture(
      [value(profile), value(profile)],
      [value(null), value(pref)],
    );
    await initializeAccount(f.client, profile.id, "Retry");
    expect(f.insertProfile).not.toHaveBeenCalled();
    expect(f.insertPreferences).toHaveBeenCalledTimes(1);
  });
  it("rereads after duplicate insert races instead of upserting protected keys", async () => {
    const duplicate = { data: null, error: { code: "23505" } };
    const f = fixture(
      [value(null), value(profile), value(profile)],
      [value(null), value(null), value(pref)],
      duplicate,
      duplicate,
    );
    expect((await initializeAccount(f.client, profile.id, "Retry")).ready).toBe(
      true,
    );
  });
  it("reports a retriable preference failure while preserving the profile", async () => {
    const f = fixture([value(profile)], [value(null)], value(null), {
      data: null,
      error: { code: "42501" },
    });
    await expect(
      initializeAccount(f.client, profile.id, "Name"),
    ).rejects.toThrow(/profile is safe/);
    expect(f.insertProfile).not.toHaveBeenCalled();
  });
  it("fails closed when reads fail and rejects blank names", async () => {
    const f = fixture([{ data: null, error: { code: "42501" } }], []);
    await expect(
      initializeAccount(f.client, profile.id, "Name"),
    ).rejects.toBeInstanceOf(AccountSetupError);
    await expect(initializeAccount(f.client, profile.id, " ")).rejects.toThrow(
      /display name/,
    );
  });
});
