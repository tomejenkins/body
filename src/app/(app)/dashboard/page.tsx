import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StartWorkout,
  StartBlankWorkout,
} from "@/components/workouts/workout-controls";
import { loadWorkout } from "@/features/workouts/queries";
import { loadHistory } from "@/features/history/queries";
import { friendlyWorkoutName } from "@/features/history/model";
import { LocalTime } from "@/components/history/local-time";
export const metadata = { title: "Home" };
export default async function Dashboard() {
  const [active, history] = await Promise.all([
    loadWorkout(),
    loadHistory("completed", undefined),
  ]);
  return (
    <div className="home-screen">
      <header className="page-heading">
        <p className="eyebrow">BODY</p>
        <h1>Your training.</h1>
        <p className="intro">A little stronger, every session.</p>
      </header>
      <section className="home-primary" aria-label="Your workout">
        <p className="eyebrow">
          {active ? "IN PROGRESS" : "READY WHEN YOU ARE"}
        </p>
        <h2>
          {active
            ? friendlyWorkoutName(active.name)
            : "Make time for your next rep."}
        </h2>
        {active ? (
          <Button asChild>
            <Link href={`/workout/${active.id}`}>Resume Workout</Link>
          </Button>
        ) : (
          <div className="entry-actions">
            <StartWorkout />
            <StartBlankWorkout />
          </div>
        )}
      </section>
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
