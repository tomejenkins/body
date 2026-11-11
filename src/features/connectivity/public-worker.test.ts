// Execute the shipped worker, rather than a duplicate cache policy.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
function worker({ denied = false, offline = false, oversized = false } = {}) {
  const handlers: Record<
    string,
    (event: {
      request?: unknown;
      waitUntil: (p: Promise<unknown>) => void;
      respondWith: (p: Promise<Response>) => void;
    }) => void
  > = {};
  const entries = new Map<string, Response>();
  const fetch = vi.fn<
    (input: unknown, init?: RequestInit) => Promise<Response>
  >(async () => {
    if (offline) throw Error("Disconnected");
    return new Response(oversized ? "x".repeat(32769) : "public shell");
  });
  const removed: string[] = [];
  const caches = {
    open: async () => {
      if (denied) throw Error("Storage denied");
      return {
        put: async (key: string, value: Response) => {
          entries.set(key, value);
        },
      };
    },
    keys: async () => [
      "unrelated-app",
      "body-public-offline-v0",
      "body-public-offline-v1",
    ],
    delete: async (key: string) => {
      removed.push(key);
      return true;
    },
    match: async (key: string | { url: string }) => {
      if (denied) throw Error("Storage denied");
      return entries
        .get(typeof key === "string" ? key : new URL(key.url).pathname)
        ?.clone();
    },
  };
  runInNewContext(readFileSync("public/body-sw.js", "utf8"), {
    self: {
      location: { origin: "https://body.test" },
      clients: { claim: vi.fn() },
      addEventListener: (name: string, fn: (typeof handlers)[string]) => {
        handlers[name] = fn;
      },
    },
    caches,
    fetch,
    URL,
    Response,
    Set,
    Error,
  });
  async function event(name: string, request?: unknown) {
    let result: Promise<unknown> | undefined;
    handlers[name]({
      request,
      waitUntil: (p) => {
        result = p;
      },
      respondWith: (p) => {
        result = p;
      },
    });
    return result;
  }
  return { event, entries, fetch, removed };
}
it("installs only two small public assets and removes only older owned caches", async () => {
  const w = worker();
  await w.event("install");
  await w.event("activate");
  expect([...w.entries.keys()]).toEqual(["/offline", "/icon.svg"]);
  expect(w.removed).toEqual(["body-public-offline-v0"]);
  expect(w.fetch.mock.calls.every((c) => c.length > 0)).toBe(true);
});
it("never intercepts POST, cross-origin, RSC, API, static bundle or authenticated read fetches", async () => {
  const w = worker();
  for (const [url, method, mode] of [
    ["/workout/id", "POST", "navigate"],
    ["/", "GET", "navigate"],
    ["https://auth.test/user", "GET", "cors"],
    ["/dashboard?_rsc=secret", "GET", "cors"],
    ["/api/private", "GET", "cors"],
    ["/_next/static/chunk.js", "GET", "cors"],
    ["/icon.svg?private=1", "GET", "cors"],
  ])
    expect(
      await w.event("fetch", {
        url: new URL(url, "https://body.test").href,
        method,
        mode,
      }),
    ).toBeUndefined();
  expect(w.fetch).not.toHaveBeenCalled();
  expect(w.entries.size).toBe(0);
});
it("passes private navigations through without persisting their responses", async () => {
  const w = worker();
  await w.event("fetch", {
    url: "https://body.test/history",
    method: "GET",
    mode: "navigate",
  });
  expect(w.fetch).toHaveBeenCalledTimes(1);
  expect(w.fetch.mock.calls[0][1]).toEqual({ redirect: "manual" });
  expect(w.entries.size).toBe(0);
});
it("offline cache eviction or storage denial still supplies public no-store fallback", async () => {
  for (const denied of [false, true]) {
    const w = worker({ offline: true, denied });
    const r = (await w.event("fetch", {
      url: "https://body.test/workout/private",
      method: "GET",
      mode: "navigate",
    })) as Response;
    expect(r.status).toBe(503);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).toContain("Unconfirmed changes are not saved");
    expect(w.entries.size).toBe(0);
  }
});
it("refuses installation if storage or the public asset size contract fails", async () => {
  await expect(worker({ denied: true }).event("install")).rejects.toThrow();
  await expect(worker({ oversized: true }).event("install")).rejects.toThrow(
    "too large",
  );
});
