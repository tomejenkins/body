import Link from "next/link";
import {
  loadEnrollmentContext,
  loadEnrollmentHistory,
} from "@/features/programs/enrollment-queries";
import { EnrollmentSummary } from "@/components/programs/enrollment-summary";
import { HistoryViewSelector } from "@/components/history/history-view-selector";
import { cursorFor } from "@/features/history/model";
export const metadata = { title: "Program History" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const params = await searchParams,
    [history, c] = await Promise.all([
      loadEnrollmentHistory(params.cursor),
      loadEnrollmentContext(),
    ]),
    last = history.items.at(-1);
  return (
    <div className="history-screen refined-screen">
      <HistoryViewSelector current="programs" />
      <div className="page-heading">
        <h1>Program History</h1>
      </div>
      {history.items.length ? (
        <ol className="enrollment-history">
          {history.items.map((a) => (
            <li key={a.id}>
              <EnrollmentSummary enrollment={a} unit={c.unit} />
            </li>
          ))}
        </ol>
      ) : (
        <section className="empty-state">
          <h2>No program enrollments yet.</h2>
          <Link href="/programs">Browse Programs</Link>
        </section>
      )}
      <nav className="history-pagination" aria-label="Program History pages">
        {params.cursor && (
          <Link href="/history/programs">Newest enrollments</Link>
        )}
        {history.hasMore && last && (
          <Link
            href={`/history/programs?${new URLSearchParams({ cursor: cursorFor(last.startedAt, last.id) })}`}
          >
            Older enrollments →
          </Link>
        )}
      </nav>
    </div>
  );
}
