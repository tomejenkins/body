import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: fixture.client }));
import { readAccess } from "./server";
beforeEach(() => {
  fixture.client.mockReset();
});
describe("server entitlement adapter", () => {
  it("does not initialize an absent identity", async () => {
    const rpc = vi.fn();
    fixture.client.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      rpc,
    });
    expect(await readAccess()).toEqual({ status: "unauthenticated" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reports activation database failures as unavailable, never expired", async () => {
    fixture.client.mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: "verified" } },
          error: null,
        }),
      },
      rpc: async () => ({ error: { code: "08006" } }),
    });
    expect(await readAccess()).toEqual({ status: "unavailable" });
  });
  it("fails closed on transport errors", async () => {
    fixture.client.mockRejectedValue(new Error("connection refused"));
    expect(await readAccess()).toEqual({ status: "unavailable" });
  });
});
