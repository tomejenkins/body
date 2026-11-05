import { qualifiedDuration } from "@/features/continuity/model";
import Link from "next/link";
import { loadHistory } from "@/features/history/queries";
import {
  cursorFor,
  friendlyWorkoutName,
  historyStatus,
} from "@/features/history/model";
import { LocalTime } from "@/components/history/local-time";
export const metadata = { title: "History" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { rows, filter, hasMore } = await loadHistory(
    params.filter,
    params.cursor,
  );
  const last = rows.at(-1);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">YOUR TRAINING STORY</p>
        <h1>Workout history</h1>
        <div className="history-destinations">
          <Link href="/history/records">Personal Records →</Link>
          <Link href="/history/progress">Training progress →</Link>
        </div>
        <p className="intro">Look back at the work you put in.</p>
      </div>
      <nav className="history-filters" aria-label="History filters">
        {(
          [
            ["all", "All workouts"],
            ["completed", "Completed"],
            ["incomplete", "Incomplete"],
            ["abandoned", "Abandoned"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={`/history?filter=${value}`}
            aria-current={filter === value ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {rows.length ? (
        <ol className="history-list">
          {rows.map((w) => (
            <li key={w.id}>
              <Link href={`/history/${w.id}`}>
                <div>
                  <h2>{friendlyWorkoutName(w.name)}</h2>
                  <LocalTime value={w.started_at} />
                </div>
                <p>{historyStatus(w.status, w.completion_status)}</p>
                <p>
                  {w.exercise_count} exercises · {w.working_sets} completed
                  working sets · {w.warm_up_sets} warm-up sets ·{" "}
                  {w.incomplete_sets} incomplete sets
                </p>
                <p>
                  {qualifiedDuration({
                    started_at: w.started_at,
                    finished_at: w.finished_at,
                    effective_finished_at: w.effective_finished_at ?? null,
                    duration_kind: w.duration_kind ?? "legacy",
                    idle_intervals: w.idle_intervals ?? [],
                  })}
                </p>
                {w.closure_reason === "inactivity" && (
                  <p>Closed after inactivity · Saved sets kept</p>
                )}
                {!!w.achievement_count && (
                  <p>
                    {w.achievement_count} personal best
                    {w.achievement_count === 1 ? "" : "s"}
                  </p>
                )}
                <span>View workout →</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <section className="empty-state">
          <h2>
            {filter === "all"
              ? "Your story starts here."
              : "No workouts in this view."}
          </h2>
          <p>Record a workout to build a history of your training.</p>
          <Link href="/workout">Record Workout</Link>
        </section>
      )}
      <div className="history-pagination">
        {params.cursor && (
          <Link href={`/history?filter=${filter}`}>Newest workouts</Link>
        )}
        {hasMore && last && (
          <Link
            href={`/history?${new URLSearchParams({ filter, cursor: cursorFor(last.started_at, last.id) })}`}
          >
            Older workouts →
          </Link>
        )}
      </div>
    </>
  );
}
