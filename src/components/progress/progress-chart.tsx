"use client";
import { useId, useState } from "react";
import Link from "next/link";
export type ChartPoint = {
  id: string;
  at: string;
  value: number;
  label: string;
  href?: string;
};
export function ProgressChart({
  title,
  unit,
  points,
  zone,
  total = points.length,
  pointNoun = "session",
}: {
  title: string;
  unit: string;
  points: ChartPoint[];
  zone: string;
  total?: number;
  pointNoun?: "session" | "period";
}) {
  const id = useId();
  const [index, setIndex] = useState(points.length - 1);
  const current = Math.min(Math.max(index, 0), points.length - 1);
  const selected = points[current];
  if (!selected)
    return (
      <p>No completed performances in this period. Try a wider date range.</p>
    );
  const dates = points.map((p) => Date.parse(p.at));
  const values = points.map((p) => p.value);
  const first = Math.min(...dates),
    last = Math.max(...dates),
    low = Math.min(...values),
    high = Math.max(...values);
  const x = (i: number) =>
    40 + ((dates[i] - first) / Math.max(1, last - first)) * 600;
  const y = (v: number) =>
    high === low ? 110 : 180 - ((v - low) / (high - low)) * 140;
  const axis = (n: number) =>
    new Intl.NumberFormat("en-US", {
      notation: Math.abs(n) >= 10000 ? "compact" : "standard",
      maximumFractionDigits: 2,
    }).format(n);
  const date = (s: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      dateStyle: "medium",
      ...(pointNoun === "session" ? { timeStyle: "short" as const } : {}),
    }).format(new Date(s));
  return (
    <figure className="progress-chart" aria-label={title}>
      <figcaption id={`${id}-title`}>
        {title} · {unit}
      </figcaption>
      <p className="chart-summary">
        {points.length} recorded{" "}
        {points.length === 1 ? pointNoun : `${pointNoun}s`}
        {total > points.length
          ? ` displayed from ${total}; chronological bucket peaks plus first/last shown`
          : ""}
        .{" "}
        {points.length === 1
          ? "More observations will reveal a trend."
          : "Select a point to view its recorded performance."}
      </p>
      <div className="chart-plot">
        <div
          className={`chart-scale ${high === low ? "constant" : ""}`}
          aria-label={`Vertical axis in ${unit}`}
        >
          <span>{axis(high)}</span>
          {high !== low && <span>{axis(low)}</span>}
        </div>
        <svg
          viewBox="0 0 680 220"
          role="img"
          aria-labelledby={`${id}-title ${id}-description`}
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const at = ((event.clientX - rect.left) / rect.width) * 680;
            let closest = 0;
            for (let i = 1; i < points.length; i++)
              if (Math.abs(x(i) - at) < Math.abs(x(closest) - at)) closest = i;
            setIndex(closest);
          }}
        >
          <desc id={`${id}-description`}>
            Observed completed performance by date. {points.length} selectable
            points. Use the point slider or data table for full details. No
            missing sessions are filled.
          </desc>
          {[40, 110, 180].map((v) => (
            <line
              key={v}
              x1="40"
              x2="640"
              y1={v}
              y2={v}
              className="chart-grid-line"
            />
          ))}
          <line
            x1={x(current)}
            x2={x(current)}
            y1="25"
            y2="195"
            className="chart-selection-line"
          />
          {points.map((p, i) => (
            <circle
              key={p.id}
              cx={x(i)}
              cy={y(p.value)}
              r={i === current ? 7 : 4}
              className={i === current ? "chart-point selected" : "chart-point"}
            />
          ))}
        </svg>
      </div>
      <div className="chart-date-axis">
        <time dateTime={points[0].at}>{date(points[0].at)}</time>
        {first !== last && (
          <time dateTime={points.at(-1)?.at}>
            {date(points.at(-1)?.at ?? points[0].at)}
          </time>
        )}
      </div>
      <label className="chart-point-picker">
        Select recorded point
        <input
          type="range"
          min="0"
          max={points.length - 1}
          value={current}
          disabled={points.length === 1}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-valuetext={`${date(selected.at)}: ${selected.label}`}
        />
      </label>
      <div className="chart-detail" role="status">
        <strong>{selected.label}</strong>
        <span>{date(selected.at)}</span>
        {selected.href && <Link href={selected.href}>View workout →</Link>}
      </div>
      <details>
        <summary>View chart data</summary>
        <div className="progress-table-scroll">
          <table>
            <caption>{title} · Recorded points</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Performance</th>
                <th scope="col">History</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.id}>
                  <td>{date(p.at)}</td>
                  <td>{p.label}</td>
                  <td>{p.href && <Link href={p.href}>View workout</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
