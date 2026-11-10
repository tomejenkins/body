// Opt-in local audit instrumentation. Never imported by application code.
import { AsyncLocalStorage } from "node:async_hooks";
import { Server } from "node:http";
import { createWriteStream } from "node:fs";
import { channel } from "node:diagnostics_channel";
const target = process.env.BODY_AUDIT_TRACE;
if (!target) throw Error("BODY_AUDIT_TRACE must name a local output file.");
const log = createWriteStream(target, { flags: "a" });
const context = new AsyncLocalStorage();
const elapsed = (start) => Number(process.hrtime.bigint() - start) / 1e6;
const path = (url) => {
  try {
    return new URL(url, "http://localhost").pathname.replace(
      /[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}/gi,
      ":id",
    );
  } catch {
    return "unknown";
  }
};
let sequence = 0;
const write = (event) =>
  log.write(
    JSON.stringify({ at: Date.now(), pid: process.pid, ...event }) + "\n",
  );
const emit = Server.prototype.emit;
Server.prototype.emit = function (event, ...args) {
  if (event !== "request") return emit.call(this, event, ...args);
  const [req, res] = args;
  const id = ++sequence,
    start = process.hrtime.bigint();
  const action = !!req.headers["next-action"];
  res.once("finish", () =>
    write({
      kind: "http",
      id,
      action,
      method: req.method,
      path: path(req.url),
      ms: elapsed(start),
      status: res.statusCode,
    }),
  );
  return context.run({ id, action }, () => emit.call(this, event, ...args));
};
const fetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const start = process.hrtime.bigint(),
    scope = context.getStore();
  const url =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
  try {
    const response = await fetch(input, init);
    write({
      kind: "fetch",
      ...scope,
      method: init?.method ?? input?.method ?? "GET",
      path: path(url),
      ms: elapsed(start),
      status: response.status,
    });
    return response;
  } catch (error) {
    write({
      kind: "fetch",
      ...scope,
      path: path(url),
      ms: elapsed(start),
      failed: true,
    });
    throw error;
  }
};

// Undici diagnostics also observe requests issued inside the middleware VM.
const wire = new WeakMap();
channel("undici:request:create").subscribe(({ request }) => {
  wire.set(request, {
    start: process.hrtime.bigint(),
    scope: context.getStore(),
  });
});
channel("undici:request:headers").subscribe(({ request, response }) => {
  const info = wire.get(request);
  if (info)
    write({
      kind: "wire",
      ...info.scope,
      method: request.method,
      path: path(String(request.origin) + request.path),
      ms: elapsed(info.start),
      status: response.statusCode,
    });
});
