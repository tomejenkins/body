"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { readTrainingProgress } from "@/features/progress/actions";
import {
  monthDays,
  shiftMonth,
  loadValue,
  numberLabel,
  type ProgressRange,
} from "@/features/progress/model";
import { useBrowserZone, useProgress } from "./use-progress";
import { RangePicker } from "./range-picker";
import { ProgressChart } from "./progress-chart";
export function TrainingProgress() {
  const zone = useBrowserZone();
  const [range, setRange] = useState<ProgressRange>("90");
  const [month, setMonth] = useState<string | null>(null);
  const [exercise, setExercise] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const fetchData = useCallback(
    () => readTrainingProgress(range, zone ?? "UTC", month, exercise),
    [range, zone, month, exercise],
  );
  const response = useProgress(
    `${range}:${zone}:${month}:${exercise}:${retry}`,
    fetchData,
    !!zone,
  );
  const data = response && "data" in response ? response.data : null;
  const unit = response && "unit" in response ? response.unit : "lb";
  const summary = data?.summary;
  const days = data ? monthDays(data.calendar_month) : [];
  const offset = days.length ? new Date(`${days[0]}T12:00:00Z`).getUTCDay() : 0;
  return (
    <>
      <div className="page-heading">
        <Link href="/history">← History</Link>
        <p className="eyebrow">YOUR TRAINING OVER TIME</p>
        <h1>Training progress</h1>
        <p className="intro">A clear view of the work you have completed.</p>
        <Link href="/history/records">Personal Records →</Link>
      </div>
      <RangePicker
        value={range}
        onChange={(v) => {
          setRange(v);
          setExercise(null);
        }}
      />
      {!response && <p role="status">Loading training progress…</p>}
      {response && "error" in response && (
        <div role="alert">
          <p>{response.error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Retry progress</button>
        </div>
      )}
      {data && summary && (
        <>
          <section className="progress-stats" aria-label="Training summary">
            <div>
              <strong>{summary.completed_workouts}</strong>
              <span>Completed workouts</span>
            </div>
            <div>
              <strong>{summary.training_days}</strong>
              <span>Training days</span>
            </div>
            <div>
              <strong>{data.working_sets}</strong>
              <span>Completed working sets</span>
            </div>
            <div>
              <strong>
                {summary.average_seconds === null
                  ? "Unavailable"
                  : `${Math.round(summary.average_seconds / 60)} min`}
              </strong>
              <span>Average elapsed session</span>
              <small>
                {summary.reliable_durations} normal finishes. Estimates and idle
                gaps excluded.
              </small>
            </div>
            <div>
              <strong>{numberLabel(summary.recent_weekly_frequency)}</strong>
              <span>Workouts per week · last 4 weeks</span>
            </div>
          </section>
          <details className="progress-note">
            <summary>About workout durations</summary>
            <p>
              {summary.estimated_durations} estimated durations and{" "}
              {summary.unreliable_durations} missing, legacy or
              inactive-interval durations excluded from the average. Elapsed
              session time is not verified time exercising.
            </p>
          </details>
          {summary.comparison_available && (
            <p>
              Previous equivalent period: {summary.previous_workouts} completed
              workouts · Current: {summary.completed_workouts}. This is a
              descriptive comparison, not a statistical conclusion.
            </p>
          )}
          {summary.completed_workouts === 0 && (
            <p>
              No completed workouts in this period. Try a wider range or record
              your first workout.
            </p>
          )}
          <section className="progress-section" aria-label="Training calendar">
            <div className="calendar-heading">
              <h2>Training days</h2>
              <div>
                <button
                  aria-label="Previous calendar month"
                  disabled={data.calendar_month <= "1900-01-01"}
                  onClick={() => setMonth(shiftMonth(data.calendar_month, -1))}
                >
                  ←
                </button>
                <strong>
                  {new Intl.DateTimeFormat("en-US", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${data.calendar_month}T12:00:00Z`))}
                </strong>
                <button
                  aria-label="Next calendar month"
                  disabled={
                    data.calendar_month.slice(0, 7) >=
                    data.window.today.slice(0, 7)
                  }
                  onClick={() => setMonth(shiftMonth(data.calendar_month, 1))}
                >
                  →
                </button>
              </div>
            </div>
            <details className="progress-note">
              <summary>Calendar and timezone</summary>
              <p>
                Workouts use their local start date in {zone}. Multiple workouts
                on one day count as one training day. Calendar month is
                independent of the summary range.
              </p>
            </details>
            <div
              className="training-calendar"
              role="group"
              aria-label="Calendar days"
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <span key={d} className="calendar-weekday">
                  {d}
                </span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={`blank${i}`} aria-hidden="true" />
              ))}
              {days.map((day) => {
                const active = data.calendar.find((d) => d.day === day);
                return active ? (
                  <Link
                    key={day}
                    className="calendar-training-day"
                    href={`/history/${active.first_session}`}
                    aria-label={`${day}: ${active.workouts} completed workout${active.workouts === 1 ? "" : "s"}. View earliest workout.`}
                  >
                    {Number(day.slice(-2))}
                    <span className="calendar-dot" aria-hidden="true" />
                  </Link>
                ) : (
                  <span key={day} aria-label={day}>
                    {Number(day.slice(-2))}
                  </span>
                );
              })}
            </div>
          </section>
          <section className="progress-section">
            <h2>Weekly training</h2>
            <p>
              {data.bucket_weeks === 1 ? "Weekly" : `${data.bucket_weeks}-week`}{" "}
              periods. Completed working sets are counted once overall. Unloaded
              bodyweight reps remain separate from external volume.
            </p>
            <details>
              <summary>View weekly working sets</summary>
              <div className="progress-table-scroll">
                <table>
                  <caption>Completed working-set trends</caption>
                  <thead>
                    <tr>
                      <th>Period starting</th>
                      <th>Working sets</th>
                      <th>Unloaded bodyweight sets</th>
                      <th>Bodyweight reps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weekly.map((w) => (
                      <tr key={w.week}>
                        <td>{w.week}</td>
                        <td>{w.working_sets}</td>
                        <td>{w.bodyweight_sets}</td>
                        <td>{w.bodyweight_reps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="progress-section" aria-label="Exercise volume">
            <h2>External-load volume</h2>
            <p>
              External load × actual reps for one exercise. Added resistance
              stays separate.
            </p>
            {data.exercises.length > 0 && (
              <label className="progress-control">
                Volume exercise
                <select
                  value={data.selected_exercise ?? ""}
                  onChange={(e) => setExercise(e.target.value)}
                >
                  {data.exercises.map((e) => (
                    <option key={e.exercise_id} value={e.exercise_id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {data.selected_exercise && (
              <Link
                className="progress-history-link"
                href={`/exercises/${data.selected_exercise}/history`}
              >
                Exercise progress and history →
              </Link>
            )}
            {(["loaded", "added"] as const).map((category) => {
              const rows = data.volumes.filter((v) => v.category === category);
              return (
                rows.length > 0 && (
                  <ProgressChart
                    key={`${range}:${data.selected_exercise}:${category}`}
                    pointNoun="period"
                    title={
                      category === "added"
                        ? "Added resistance volume"
                        : "Exercise external-load volume"
                    }
                    unit={`${unit} × reps`}
                    zone="UTC"
                    points={rows.map((v) => ({
                      id: v.week,
                      at: `${v.week}T12:00:00Z`,
                      value: loadValue(v.value, unit),
                      label: `${numberLabel(loadValue(v.value, unit), unit)} ${unit} × reps · ${v.week} to ${new Date(Date.parse(`${v.until_day}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)}`,
                    }))}
                  />
                )
              );
            })}
            {data.volumes.length === 0 && (
              <p>
                No eligible external-load volume in this view. Bodyweight-only
                work contributes sets and reps above.
              </p>
            )}
            <p className="progress-note">
              Exercise choices show the 20 most-trained exercises in this range.
              Every exercise has its own full Progress view from the library.
            </p>
          </section>
          <section className="progress-section" aria-label="Muscle exposure">
            <h2>Muscle-group exposure</h2>
            <p>
              Primary exposure and secondary involvement are shown separately.
              Muscle groups overlap; do not add them to the overall set count.
            </p>
            <details>
              <summary>View muscle exposure by period</summary>
              <div className="progress-table-scroll">
                <table>
                  <caption>Primary exposure and secondary involvement</caption>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Muscle</th>
                      <th>Primary sets</th>
                      <th>Secondary sets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.muscles.map((m) => (
                      <tr key={`${m.week}:${m.muscle_group_id}`}>
                        <td>{m.week}</td>
                        <td>{m.name}</td>
                        <td>{m.primary_sets}</td>
                        <td>{m.secondary_sets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
    </>
  );
}
