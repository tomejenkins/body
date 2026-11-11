import { HistoryViewSelector } from "@/components/history/history-view-selector";
import { HistoryCard } from "@/components/history/history-card";
import Link from "next/link";
import { loadHistory } from "@/features/history/queries";
import { cursorFor } from "@/features/history/model";
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
    <div className="history-screen refined-screen">
      <HistoryViewSelector current="workouts" />
      <div className="page-heading">
        <h1>
          {filter === "archived" ? "Archived Workouts" : "Workout history"}
        </h1>
        <div className="history-destinations">
          <Link href="/history?filter=archived">Archived Workouts →</Link>
          <Link href="/history/records">Personal Records →</Link>
          <Link href="/history/progress">Training progress →</Link>
        </div>
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
              <HistoryCard workout={w} archived={filter === "archived"} />
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
    </div>
  );
}
