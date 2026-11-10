// Numeric-only evidence summary; does not read cookies, headers or request bodies.
import { readFileSync } from "node:fs";
const [samplesPath, controlPath, tracePath] = process.argv.slice(2);
if (!samplesPath || !controlPath || !tracePath)
  throw Error(
    "Usage: node scripts/audit/summarize.mjs samples.json control.json server-trace.jsonl",
  );
const samples = JSON.parse(readFileSync(samplesPath, "utf8"));
const control = JSON.parse(readFileSync(controlPath, "utf8"));
const trace = readFileSync(tracePath, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const percentile = (values, p) => {
  const a = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!a.length) return null;
  const n = (a.length - 1) * p,
    i = Math.floor(n);
  return Math.round((a[i] + (a[Math.ceil(n)] - a[i]) * (n - i)) * 100) / 100;
};
const stats = (values) => ({
  n: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  min: percentile(values, 0),
  max: percentile(values, 1),
});
function summarize(data) {
  return Object.fromEntries(
    [...new Set(data.samples.map((s) => s.profile))].map((profile) => {
      const rows = data.samples.filter((s) => s.profile === profile);
      return [
        profile,
        {
          samples: rows.length,
          domSavedMs: stats(
            rows.map((s) => s.observedDomSavedAt - s.operationStart),
          ),
          automationAcknowledgementMs: stats(
            rows.map((s) => s.acknowledgementMs),
          ),
          mutationResourceMs: stats(rows.map((s) => s.resources[0].duration)),
          domAfterMutationResponseMs: stats(
            rows.map((s) => s.observedDomSavedAt - s.resources[0].responseEnd),
          ),
          browserRequestCounts: [...new Set(rows.map((s) => s.requestCount))],
          requestBodyBytes: stats(
            rows.map((s) => s.requests.reduce((n, r) => n + r.requestBytes, 0)),
          ),
          responseBodyBytes: stats(
            rows.map((s) =>
              s.resources.reduce((n, r) => n + r.encodedBodyBytes, 0),
            ),
          ),
          longTaskCount: data.longTasks.length,
        },
      ];
    }),
  );
}
const windows = samples.samples.map((s) => ({
  start: samples.timeOrigin + s.operationStart,
  end: samples.timeOrigin + Math.max(...s.resources.map((r) => r.responseEnd)),
  profile: s.profile,
}));
const server = [];
for (const request of trace.filter(
  (e) => e.kind === "http" && e.action && e.path === "/workout/:id",
)) {
  const rpc = trace.find(
    (e) =>
      e.kind === "wire" &&
      e.pid === request.pid &&
      e.id === request.id &&
      e.path === "/rest/v1/rpc/log_workout_set",
  );
  if (!rpc) continue;
  const window = windows.find(
    (w) => request.at >= w.start - 5 && request.at <= w.end + 20,
  );
  if (!window) continue;
  const calls = trace.filter(
    (e) => e.kind === "wire" && e.pid === request.pid && e.id === request.id,
  );
  server.push({
    profile: window.profile,
    httpMs: request.ms,
    calls: calls.map((e) => ({ path: e.path, ms: e.ms })),
  });
}
console.log(
  JSON.stringify(
    {
      method:
        "12 sequential edits per profile; linear-interpolated p95; response-commit DOM observer, Resource Timing, opt-in HTTP/Undici spans",
      control: summarize(control),
      profiles: summarize(samples),
      server: {
        samples: server.length,
        httpMs: stats(server.map((s) => s.httpMs)),
        callsPerMutation: [...new Set(server.map((s) => s.calls.length))],
        authReadsPerMutation: [
          ...new Set(
            server.map(
              (s) => s.calls.filter((c) => c.path === "/auth/v1/user").length,
            ),
          ),
        ],
        rpcTransportMs: stats(
          server.map(
            (s) => s.calls.find((c) => c.path.endsWith("/log_workout_set"))?.ms,
          ),
        ),
      },
    },
    null,
    2,
  ),
);
