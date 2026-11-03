import { afterEach, describe, expect, it, vi } from "vitest";
import { authConfigured, authCookieOptions, getSiteOrigin } from "./config";
afterEach(() => vi.unstubAllEnvs());
describe("trusted authentication origin", () => {
  it.each([
    "https://body.example/path",
    "https://body.example/?next=evil",
    "https://body.example/#fragment",
    "https://user:password@body.example",
    "http://body.example",
    "javascript:alert(1)",
  ])("rejects unsafe configuration %s", (value) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
    expect(getSiteOrigin).toThrow();
  });
  it("uses secure HTTPS cookies and a normalized canonical origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://body.example/");
    expect(getSiteOrigin()).toBe("https://body.example");
    expect(authCookieOptions()).toEqual({
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
  it("permits local HTTP development without secure cookies", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
    expect(authCookieOptions().secure).toBe(false);
  });
  it("fails closed when the canonical origin is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(authConfigured()).toBe(false);
  });
});
