import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import type { CookieMethodsServer } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { updateSession } from "./update-session";
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
const getUser = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "local-public-test-value");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
  vi.mocked(createServerClient).mockReturnValue({
    auth: { getUser },
  } as unknown as ReturnType<typeof createServerClient>);
});
afterEach(() => vi.unstubAllEnvs());
describe("server session boundary", () => {
  it("redirects missing identities while preserving safe intended destinations", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await updateSession(
      new NextRequest("http://127.0.0.1:3000/history?range=30"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/login?next=%2Fhistory%3Frange%3D30",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("never trusts an expired or unverifiable cookie", async () => {
    getUser.mockRejectedValue(new Error("network"));
    const response = await updateSession(
      new NextRequest("http://127.0.0.1:3000/dashboard", {
        headers: { cookie: "fake-session=unverified" },
      }),
    );
    expect(response.headers.get("location")).toContain("/login");
  });
  it("lets verified identities through and overwrites client navigation headers", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "verified" } },
      error: null,
    });
    const response = await updateSession(
      new NextRequest("http://127.0.0.1:3000/profile", {
        headers: { "x-body-next": "https://evil.example" },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-body-next")).toBe(
      "/profile",
    );
  });
  it("carries refreshed cookies and SDK cache headers onto a redirect", async () => {
    vi.mocked(createServerClient).mockImplementation((_url, _key, options) => {
      const cookies = options.cookies as CookieMethodsServer;
      return {
        auth: {
          getUser: async () => {
            await cookies.setAll?.(
              [
                {
                  name: "refreshed",
                  value: "local-test-token",
                  options: { path: "/", sameSite: "lax" },
                },
              ],
              {
                "Cache-Control": "private, no-store",
                Pragma: "no-cache",
                Expires: "0",
              },
            );
            return { data: { user: null }, error: null };
          },
        },
      } as unknown as ReturnType<typeof createServerClient>;
    });
    const response = await updateSession(
      new NextRequest("http://127.0.0.1:3000/workout"),
    );
    expect(response.cookies.get("refreshed")?.value).toBe("local-test-token");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("expires")).toBe("0");
  });
});
