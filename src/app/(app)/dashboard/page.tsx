import { readAccess } from "@/features/entitlements/server";
import { AccessStatus } from "@/components/entitlements/access-status";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { randomUUID } from "node:crypto";
import { TrainingWeek } from "@/components/dashboard/training-week";
import { loadTrainingWeek } from "@/features/scheduling/dashboard-queries";
import { loadHistory } from "@/features/history/queries";
import { HistoryCard } from "@/components/history/history-card";
export const metadata = { title: "Home" };
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const access = await readAccess();
  const [history, week] = await Promise.all([
    loadHistory("completed", undefined),
    loadTrainingWeek(params.week),
  ]);
  return (
    <div className="home-screen refined-screen">
      <header className="page-heading">
        <h1>Your training.</h1>
        <p className="intro">Your next session. Your progress.</p>
      </header>
      {access.status !== "ready" || !access.decision.allowed ? (
        <AccessStatus result={access} />
      ) : null}
      <TrainingWeek
        trainingAccess={access.status === "ready" && access.decision.allowed}
        key={`${week.schedule?.assignmentId}:${week.schedule?.from}`}
        {...week}
        activeSession={history.activeSession}
        request={randomUUID()}
      />
      {history.rows.length > 0 && (
        <section className="recent-metrics" aria-label="Recent training totals">
          <p>Last {Math.min(3, history.rows.length)} completed workouts</p>
          <dl>
            <div>
              <dt>Working sets</dt>
              <dd>
                {history.rows
                  .slice(0, 3)
                  .reduce((n, w) => n + w.working_sets, 0)}
              </dd>
            </div>
            <div>
              <dt>Personal bests</dt>
              <dd>
                {history.rows
                  .slice(0, 3)
                  .reduce((n, w) => n + (w.achievement_count ?? 0), 0)}
              </dd>
            </div>
          </dl>
        </section>
      )}
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
                <HistoryCard workout={w} compact />
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
