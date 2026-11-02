import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "./client";
afterEach(() => vi.unstubAllEnvs());
describe("Supabase configuration", () => {
  it("fails explicitly when unconfigured rather than fabricating authentication", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => createClient()).toThrow("Configure the public Supabase");
  });
});
