"use client";
import { useCallback, useState } from "react";
import { readExerciseProgress } from "@/features/progress/actions";
import {
  loadValue,
  numberLabel,
  seriesKey,
  type ProgressRange,
} from "@/features/progress/model";
import { formattedMetric, metricLabel } from "@/features/records/model";
import { useBrowserZone, useProgress } from "./use-progress";
import { RangePicker } from "./range-picker";
import { ProgressChart } from "./progress-chart";
export function ExerciseProgress({ id }: { id: string }) {
  const zone = useBrowserZone();
  const [range, setRange] = useState<ProgressRange>("90");
  const [metric, setMetric] = useState("");
  const [load, setLoad] = useState<{ kg: number; category: string } | null>(
    null,
  );
  const [reps, setReps] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const fetchData = useCallback(
    () =>
      readExerciseProgress(
        id,
        range,
        zone ?? "UTC",
        load?.kg ?? null,
        load?.category ?? null,
        reps,
      ),
    [id, range, zone, load, reps],
  );
  const response = useProgress(
    `${id}:${range}:${zone}:${load?.category}:${load?.kg}:${reps}:${retry}`,
    fetchData,
    !!zone,
  );
  const data = response && "data" in response ? response.data : null;
  const unit = response && "unit" in response ? response.unit : "lb";
  const chosen =
    data?.series.find((s) => seriesKey(s) === metric) ??
    data?.series.find((s) => s.metric === "bodyweight_reps") ??
    data?.series.find((s) => s.metric === "heaviest") ??
    data?.series[0];
  return (
    <section className="progress-section" aria-label="Exercise progress">
      <h2>Progress</h2>
      <p>
        Completed working performance for this exercise. Warm-ups and unfinished
        workouts are excluded.
      </p>
      <div className="progress-controls">
        <RangePicker
          value={range}
          onChange={(v) => {
            setRange(v);
            setLoad(null);
            setReps(null);
          }}
        />
        {data && data.series.length > 0 && (
          <label className="progress-control">
            Chart metric
            <select
              value={chosen ? seriesKey(chosen) : ""}
              onChange={(e) => setMetric(e.target.value)}
            >
              {data.series.map((s) => (
                <option key={seriesKey(s)} value={seriesKey(s)}>
                  {metricLabel(s.points[0])}
                  {s.category === "added" ? " · Added resistance" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {data && data.loads.length > 0 && (
          <label className="progress-control">
            Comparable load
            <select
              value={`${data.selected_category}:${data.selected_load}`}
              onChange={(e) => {
                const [category, kg] = e.target.value.split(":");
                setLoad({ category, kg: Number(kg) });
                setMetric(`${category}:reps_at_load:${kg}`);
              }}
            >
              {data.loads.map((l) => (
                <option
                  key={`${l.category}:${l.kg}`}
                  value={`${l.category}:${l.kg}`}
                >
                  {l.category === "added" ? "+" : ""}
                  {numberLabel(loadValue(l.kg, unit), unit)} {unit}
                </option>
              ))}
            </select>
          </label>
        )}
        {data && data.observed_reps.length > 0 && (
          <label className="progress-control">
            Exact repetitions
            <select
              value={data.selected_reps ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                setReps(n);
                setMetric(`loaded:actual_rm:${n}`);
              }}
            >
              {data.observed_reps.map((n) => (
                <option key={n} value={n}>
                  {n} reps
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!response && <p role="status">Loading progress…</p>}
      {response && "error" in response && (
        <div role="alert">
          <p>{response.error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Retry progress</button>
        </div>
      )}
      {data && !chosen && (
        <p>
          No eligible completed performance in this period. Try All time.
          Assistance and duration measurements are not supported.
        </p>
      )}
      {data && chosen && zone && (
        <ProgressChart
          key={`${range}:${seriesKey(chosen)}:${data.selected_load}`}
          title={metricLabel(chosen.points[0])}
          unit={
            chosen.metric === "bodyweight_reps" ||
            chosen.metric === "reps_at_load"
              ? "reps"
              : chosen.metric === "volume"
                ? `${unit} × reps`
                : unit
          }
          zone={zone}
          total={chosen.total_points}
          points={chosen.points.map((p) => ({
            id: p.session_id,
            at: p.performed_at,
            value:
              p.metric === "bodyweight_reps" || p.metric === "reps_at_load"
                ? p.value
                : loadValue(p.value, unit),
            label:
              formattedMetric(p, unit) +
              (p.reps &&
              p.metric !== "reps_at_load" &&
              p.metric !== "bodyweight_reps"
                ? ` · ${p.reps} actual reps`
                : ""),
            href: `/history/${p.session_id}`,
          }))}
        />
      )}
      <p className="progress-note">
        Each point is an actual session observation. Estimates are labeled.
        Dates use {zone ?? "your local timezone"}. Load choices show the 20
        most-used loads in this period; all record loads remain in Look Back
        below.
      </p>
    </section>
  );
}
