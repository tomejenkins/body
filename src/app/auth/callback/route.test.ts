import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const exchangeCodeForSession = vi.fn(),
  verifyOtp = vi.fn(),
  getUser = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "local-public-test-value");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
  vi.mocked(createClient).mockResolvedValue({
    auth: { exchangeCodeForSession, verifyOtp, getUser },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  getUser.mockResolvedValue({
    data: { user: { id: "verified" } },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("email callback", () => {
  it("exchanges a code and sanitizes next before redirecting", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const r = await GET(
      new NextRequest(
        "http://127.0.0.1:3000/auth/callback?code=test-code&next=https://evil.example",
      ),
    );
    expect(r.headers.get("location")).toBe("http://127.0.0.1:3000/dashboard");
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("supports recovery token hashes", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const r = await GET(
      new NextRequest(
        "http://127.0.0.1:3000/auth/callback?token_hash=local-test-hash&type=recovery",
      ),
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "local-test-hash",
      type: "recovery",
    });
    expect(r.headers.get("location")).toBe(
      "http://127.0.0.1:3000/reset-password",
    );
  });
  it("rejects expired verification links and unsupported OTP types", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } });
    const r = await GET(
      new NextRequest("http://127.0.0.1:3000/auth/callback?code=expired"),
    );
    expect(r.headers.get("location")).toContain("error=callback");
    const unsupported = await GET(
      new NextRequest(
        "http://127.0.0.1:3000/auth/callback?token_hash=x&type=invite",
      ),
    );
    expect(unsupported.headers.get("location")).toContain("error=callback");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
