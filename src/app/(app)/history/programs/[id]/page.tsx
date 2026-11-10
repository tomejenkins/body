import Link from "next/link";
import { notFound } from "next/navigation";
import {
  loadEnrollment,
  loadEnrollmentContext,
} from "@/features/programs/enrollment-queries";
import {
  lifecycleReasons,
  enrollmentDuration,
} from "@/features/programs/enrollment-model";
import { EnrollmentStrength } from "@/components/programs/enrollment-summary";
import { HistoryViewSelector } from "@/components/history/history-view-selector";
import {
  cursorFor,
  historyStatus,
  friendlyWorkoutName,
  localTimestamp,
} from "@/features/history/model";
export const metadata = { title: "Program History detail" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const { id } = await params,
    query = await searchParams,
    [loaded, c] = await Promise.all([
      loadEnrollment(id, query.cursor),
      loadEnrollmentContext(),
    ]);
  if (!loaded) notFound();
  const a = loaded.enrollment,
    last = loaded.workouts.at(-1);
  return (
    <section className="enrollment-surface">
      <HistoryViewSelector current="programs" />
      <Link href="/history/programs">← Program History</Link>
      <h1>{a.name}</h1>
      <p>
        {a.status} · {enrollmentDuration(a)}
      </p>
      <p className="set-source">
        {a.versionId
          ? `Original immutable version ${a.versionNumber}`
          : "Legacy program · Immutable version unavailable"}
      </p>
      <dl className="enrollment-details">
        <div>
          <dt>
            {a.provenance === "server" ? "Started" : "Recorded start (legacy)"}
          </dt>
          <dd>
            <time dateTime={a.startedAt}>
              {localTimestamp(a.startedAt, a.timezone)}
            </time>
          </dd>
        </div>
        {a.endedAt && (
          <div>
            <dt>Ended</dt>
            <dd>
              <time dateTime={a.endedAt}>
                {localTimestamp(a.endedAt, a.timezone)}
              </time>
            </dd>
          </div>
        )}
        <div>
          <dt>Enrollment timezone</dt>
          <dd>{a.timezone}</dd>
        </div>
        <div>
          <dt>Qualifying completed workouts</dt>
          <dd>
            {a.workouts} · {a.fullWorkouts} full · {a.partialWorkouts} partial
          </dd>
        </div>
        <div>
          <dt>Complete training rotations</dt>
          <dd>
            {a.completedRotations}
            {a.durationRotations ? ` / ${a.durationRotations}` : ""}
          </dd>
        </div>
      </dl>
      {a.terminalReason && (
        <p>Recorded ending: {lifecycleReasons[a.terminalReason]}</p>
      )}
      {a.completionEvidenceChanged && (
        <p>
          Your program ended after previously qualifying training. Current
          retained training history is incomplete.
        </p>
      )}
      {a.pendingEnd && (
        <p>Program will end after your next completed program workout.</p>
      )}
      {a.state === "active" && (
        <Link href="/programs/current#manage-program">Manage Program</Link>
      )}
      <EnrollmentStrength enrollment={a} unit={c.unit} />
      <section aria-label="Assigned workout history">
        <h2>Workouts in this enrollment</h2>
        {loaded.workouts.length ? (
          <ol className="history-list">
            {loaded.workouts.map((w) => (
              <li key={w.id}>
                <Link href={`/history/${w.id}`}>
                  <h3>{friendlyWorkoutName(w.name)}</h3>
                  <time dateTime={w.started_at}>
                    {localTimestamp(w.started_at, a.timezone)}
                  </time>
                  <p>
                    {historyStatus(w.status, w.completion_status)} ·{" "}
                    {w.working_sets} qualifying working sets
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p>No associated workouts yet.</p>
        )}
        <nav className="history-pagination" aria-label="Assigned workout pages">
          {query.cursor && (
            <Link href={`/history/programs/${a.id}`}>Newest workouts</Link>
          )}
          {loaded.hasMore && last && (
            <Link
              href={`/history/programs/${a.id}?${new URLSearchParams({ cursor: cursorFor(last.started_at, last.id) })}`}
            >
              Older workouts →
            </Link>
          )}
        </nav>
      </section>
    </section>
  );
}
