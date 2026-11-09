import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { randomUUID } from "node:crypto";
import { TrainingWeek } from "@/components/dashboard/training-week";
import { loadTrainingWeek } from "@/features/scheduling/dashboard-queries";
import { loadHistory } from "@/features/history/queries";
import { friendlyWorkoutName } from "@/features/history/model";
import { LocalTime } from "@/components/history/local-time";
export const metadata = { title: "Home" };
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [history, week] = await Promise.all([
    loadHistory("completed", undefined),
    loadTrainingWeek(params.week),
  ]);
  return (
    <div className="home-screen">
      <header className="page-heading">
        <p className="eyebrow">BODY</p>
        <h1>Your training.</h1>
        <p className="intro">A little stronger, every session.</p>
      </header>
      <TrainingWeek
        key={`${week.schedule?.assignmentId}:${week.schedule?.from}`}
        {...week}
        activeSession={history.activeSession}
        request={randomUUID()}
      />
      <nav className="home-shortcuts" aria-label="Training shortcuts">
        <Link href="/programs">
          Programs <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <Link href="/exercises">
          Exercises <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <Link href="/history/progress">
          Progress <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </nav>
      <section className="home-recent">
        <div className="section-title">
          <h2>Recent training</h2>
          <Link href="/history">View all →</Link>
        </div>
        {history.rows.length ? (
          <ol className="history-list">
            {history.rows.slice(0, 3).map((w) => (
              <li key={w.id}>
                <Link href={`/history/${w.id}`}>
                  <h3>{friendlyWorkoutName(w.name)}</h3>
                  <p>
                    <LocalTime value={w.started_at} /> · {w.working_sets}{" "}
                    working sets
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-copy">
            Your completed workouts will appear here. Start with what feels
            right today.
          </p>
        )}
      </section>
    </div>
  );
}
