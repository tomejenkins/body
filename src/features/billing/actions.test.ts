import { it, expect, vi, beforeEach } from "vitest";
const f = vi.hoisted(() => ({
  user: vi.fn(),
  checkout: vi.fn(),
  portal: vi.fn(),
  reconcile: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/features/auth/session", () => ({ requireUser: f.user }));
vi.mock("./service", () => ({
  billingService: () => ({
    checkout: f.checkout,
    portal: f.portal,
    reconcile: f.reconcile,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("REDIRECT:" + url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: f.refresh }));
import { startCheckout, openPortal, refreshBilling } from "./actions";
beforeEach(() => {
  vi.resetAllMocks();
  f.user.mockResolvedValue({ id: "verified-owner" });
});
it("authentication failure stops Checkout before any provider operation", async () => {
  f.user.mockRejectedValueOnce(new Error("unauthenticated"));
  await expect(startCheckout({}, new FormData())).rejects.toThrow(
    "unauthenticated",
  );
  expect(f.checkout).not.toHaveBeenCalled();
});
it("rejects a Price ID submitted as a plan", async () => {
  const form = new FormData();
  form.set("plan", "price_foreign");
  expect((await startCheckout({}, form)).error).toBeTruthy();
  expect(f.checkout).not.toHaveBeenCalled();
});
it("owner/customer/return URL fields cannot override verified identity", async () => {
  const form = new FormData();
  form.set("plan", "annual");
  form.set("owner", "foreign");
  form.set("customer", "cus_foreign");
  form.set("return_url", "https://evil.test");
  f.checkout.mockResolvedValue("https://checkout.stripe.com/c/pay/fixture");
  await expect(startCheckout({}, form)).rejects.toThrow(
    "REDIRECT:https://checkout.stripe.com/",
  );
  expect(f.checkout).toHaveBeenCalledWith("verified-owner", "annual");
});
it("unexpected provider destination never becomes an external redirect", async () => {
  const form = new FormData();
  form.set("plan", "monthly");
  f.checkout.mockResolvedValue("https://evil.test");
  expect((await startCheckout({}, form)).error).toBeTruthy();
});
it("Portal uses current identity and rejects an unsafe destination", async () => {
  f.portal.mockResolvedValue("https://evil.test");
  expect((await openPortal()).error).toBeTruthy();
  expect(f.portal).toHaveBeenCalledWith("verified-owner");
});
it("refresh validates a forged session reference before provider access", async () => {
  const form = new FormData();
  form.set("session", "https://evil.test");
  expect((await refreshBilling({}, form)).error).toBeTruthy();
  expect(f.reconcile).not.toHaveBeenCalled();
});
it("reconciliation errors are not success or expiration", async () => {
  f.reconcile.mockRejectedValue(new Error("private provider details"));
  const result = await refreshBilling({}, new FormData());
  expect(result.error).toContain("temporarily unavailable");
  expect(result.message).toBeUndefined();
  expect(result.error).not.toContain("private provider");
  expect(f.refresh).not.toHaveBeenCalled();
});
