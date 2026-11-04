import Link from "next/link";
import { loadRecords } from "@/features/records/queries";
import { featuredLifts } from "@/features/records/prominence";
import { RecordCard } from "@/components/records/record-card";
export const metadata = { title: "Personal Records" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const data = await loadRecords(q.q, q.cursor);
  const last = data.rows.at(-1);
  return (
    <>
      <div className="page-heading">
        <Link href="/history">← History</Link>
        <p className="eyebrow">YOUR PERSONAL BESTS</p>
        <h1>Personal Records</h1>
        <p className="intro">
          Recorded lifts and meaningful improvements. Every exercise has its own
          story.
        </p>
      </div>
      <section aria-label="Featured lifts">
        <h2>Featured lifts</h2>
        <div className="records-grid">
          {featuredLifts.map((lift) => {
            const record = data.featured.find((r) => r.exercise_id === lift.id);
            return record ? (
              <RecordCard key={lift.id} record={record} unit={data.unit} />
            ) : (
              <section className="record-card" key={lift.id}>
                <h3>{lift.name}</h3>
                <p>No completed working sets recorded yet.</p>
                <Link href={`/exercises/${lift.id}/history`}>Look Back →</Link>
              </section>
            );
          })}
        </div>
      </section>
      <section className="library-section">
        <h2>Other achievements</h2>
        <form method="get" className="records-search">
          <label htmlFor="record-search">Find an exercise record</label>
          <input
            id="record-search"
            name="q"
            type="search"
            maxLength={120}
            defaultValue={data.query}
          />
          <button type="submit">Search</button>
        </form>
        {data.rows.length ? (
          <div className="records-grid">
            {data.rows.map((r) => (
              <RecordCard key={r.exercise_id} record={r} unit={data.unit} />
            ))}
          </div>
        ) : (
          <p>
            No matching completed performances yet. Record a workout to begin.
          </p>
        )}
        <div className="history-pagination">
          {q.cursor && (
            <Link
              href={`/history/records?${new URLSearchParams({ q: data.query })}`}
            >
              Newest records
            </Link>
          )}
          {data.hasMore && last && (
            <Link
              href={`/history/records?${new URLSearchParams({ q: data.query, cursor: last.exercise_id })}`}
            >
              More exercises →
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
