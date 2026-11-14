import { describe, expect, it } from "vitest";
import { parseAccess, trainingAllowed, type AccessDecision } from "./model";
const decision: AccessDecision = {
  allowed: false,
  source: "none",
  expiresAt: null,
  trialActivatedAt: "2026-11-01T00:00:00Z",
  trialExpiresAt: "2026-11-15T00:00:00Z",
  state: "expired",
  continuationAllowed: false,
  continuationUntil: null,
  checkedAt: "2026-11-15T00:00:00Z",
};
describe("authoritative access presentation", () => {
  it("fails closed on unavailable authority and absent identity", () => {
    expect(trainingAllowed({ status: "unavailable" })).toBe(false);
    expect(trainingAllowed({ status: "unauthenticated" })).toBe(false);
  });
  it("uses only the backend decision, never browser time or expired trial precedence", () => {
    expect(trainingAllowed({ status: "ready", decision })).toBe(false);
    expect(
      trainingAllowed({
        status: "ready",
        decision: { ...decision, allowed: true, source: "lifetime" },
      }),
    ).toBe(true);
    expect(
      trainingAllowed({
        status: "ready",
        decision: { ...decision, continuationAllowed: true },
      }),
    ).toBe(true);
  });
  it("rejects malformed authority responses", () => {
    for (const value of [
      null,
      {},
      { ...decision, allowed: "true" },
      { ...decision, source: "premium" },
      { ...decision, expiresAt: "invalid" },
      { ...decision, checkedAt: null },
    ])
      expect(parseAccess(value)).toBeNull();
    expect(parseAccess(decision)).toEqual(decision);
  });
});
