// Local, numeric-only audit aggregation. No cookies, headers or request bodies.
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [baseline, final, navigation, stress, output] = process.argv.slice(2);
if (!output)
  throw Error(
    "Usage: node scripts/audit/summarize-readiness.mjs baselineDir finalDir navigationDir stressDir output.json",
  );
function read(root, name) {
  const files = globSync(join(root, "**", name));
  if (files.length !== 1)
    throw Error(`Expected one ${name}, found ${files.length}`);
  return JSON.parse(readFileSync(files[0], "utf8"));
}
function stats(values) {
  const a = values.toSorted((x, y) => x - y),
    n = a.length;
  if (!n) return { n: 0 };
  const q = (p) => {
    const x = (n - 1) * p,
      i = Math.floor(x);
    return (
      Math.round((a[i] + (a[Math.min(i + 1, n - 1)] - a[i]) * (x - i)) * 100) /
      100
    );
  };
  return { n, p50: q(0.5), p95: q(0.95), min: q(0), max: q(1) };
}
function saves(data) {
  return Object.fromEntries(
    [...new Set(data.samples.map((s) => s.profile))].map((profile) => {
      const s = data.samples.filter((x) => x.profile === profile);
      return [
        profile,
        {
          domSavedMs: stats(
            s.map((x) => x.observedDomSavedAt - x.operationStart),
          ),
          browserRequests: [...new Set(s.map((x) => x.requestCount))],
          requestBytes: stats(
            s.map((x) => x.requests.reduce((n, r) => n + r.requestBytes, 0)),
          ),
          responseBytes: stats(
            s.map((x) =>
              x.resources.reduce((n, r) => n + r.encodedBodyBytes, 0),
            ),
          ),
          longTasks: data.longTasks.length,
        },
      ];
    }),
  );
}
function routes(data) {
  const out = {};
  for (const name of new Set(data.samples.map((x) => x.name)))
    for (const latency of [0, 80, 300]) {
      const s = data.samples.filter(
        (x) => x.name === name && x.latency === latency,
      );
      out[`${name}:${latency}`] = {
        automationReadinessMs: stats(s.map((x) => x.readyMs)),
        transferBytes: stats(s.map((x) => x.bytes)),
      };
    }
  return out;
}
const cpu = read(stress, "logging-samples.json");
writeFileSync(
  output,
  JSON.stringify(
    {
      baseline: saves(read(baseline, "logging-samples.json")),
      final: saves(read(final, "logging-samples.json")),
      navigationFinal: routes(read(navigation, "navigation-samples.json")),
      stress: { cpuThrottle: cpu.cpuThrottle, profiles: saves(cpu) },
    },
    null,
    2,
  ) + "\n",
);
