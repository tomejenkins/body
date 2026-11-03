import { describe, expect, it } from "vitest";
import {
  safeNext,
  callbackNext,
  validateRegistration,
  validatePassword,
} from "./validation";
describe("authentication input boundaries", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2fevil.example",
    "/dashboard%0d%0aLocation:evil",
    "/dashboard/%5cevil",
    "/auth/callback",
    "/login",
    "javascript:alert(1)",
    "/dashboard/../../evil",
    "%",
    null,
    ["/history"],
  ])("rejects unsafe redirect %s", (value) => {
    expect(safeNext(value)).toBe("/dashboard");
  });
  it("preserves safe destinations and queries", () => {
    expect(safeNext("/history?range=30")).toBe("/history?range=30");
    expect(callbackNext("/reset-password")).toBe("/reset-password");
    expect(safeNext("/reset-password")).toBe("/dashboard");
  });
  it("validates email, password length, and confirmation", () => {
    expect(
      validateRegistration(
        "invalid",
        "a valid passphrase",
        "a valid passphrase",
      ),
    ).toMatch(/email/);
    expect(
      validateRegistration("local@example.test", "short", "short"),
    ).toMatch(/12/);
    expect(
      validateRegistration(
        "local@example.test",
        "a valid passphrase",
        "different",
      ),
    ).toMatch(/match/);
    expect(
      validateRegistration(
        "local@example.test",
        "a valid passphrase",
        "a valid passphrase",
      ),
    ).toBeUndefined();
    expect(validatePassword("é".repeat(40))).toBe(false);
  });
});
