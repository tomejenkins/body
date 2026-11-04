import { loadWorkoutContext } from "@/features/workouts/context";
import {
  builderHref,
  exerciseHref,
  contextFilters,
} from "@/features/workouts/navigation";
import { specialMeasurement } from "@/features/history/measurement";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/features/exercises/validation";
import { loadExerciseHistory } from "@/features/history/queries";
import {
  cursorFor,
  performanceLabel,
  friendlyWorkoutName,
} from "@/features/history/model";
import { setTypes } from "@/features/sets/model";
import { LocalTime } from "@/components/history/local-time";
import { ExerciseThumbnail } from "@/components/exercises/exercise-thumbnail";
export const metadata = { title: "Look Back" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams,
    data = await loadExerciseHistory(id, query.cursor);
  if (!data) notFound();
  const context = await loadWorkoutContext(query.workoutId, id);
  const filters = contextFilters(query.builder);
  const detail = exerciseHref(id, context?.id, filters);
  const historyPath = exerciseHref(id, context?.id, filters, true);
  const { exercise, history, unit, hasMore } = data,
    last = history.entries.at(-1);
  return (
    <>
      <div className="page-heading">
        {context ? (
          <>
            <Link href={detail}>← Back to Exercise Details</Link>
            <div className="library-section">
              <Link
                href={
                  context.status === "in_progress"
                    ? builderHref(context.id, filters)
                    : `/workout/${context.id}`
                }
              >
                {context.status === "in_progress"
                  ? "Back to Workout Builder"
                  : "Back to Workout"}
              </Link>
            </div>
          </>
        ) : (
          <Link href="/history">← History</Link>
        )}
        <p className="eyebrow">LOOK BACK</p>
        <ExerciseThumbnail
          size={80}
          decorative={false}
          visual={{ slug: exercise.slug, ownerId: exercise.owner_id }}
        />
        <h1>{exercise.name}</h1>
        {specialMeasurement(id) && (
          <p role="note">
            {specialMeasurement(id) === "duration"
              ? "Time and distance history need a dedicated tracking format, which is not available yet."
              : "Assistance is not added weight. Assistance history needs a dedicated tracking format, which is not available yet."}{" "}
            Legacy unsupported measurements are excluded from performance
            summaries.
          </p>
        )}
        <p>{history.total_sessions} completed workouts with performed sets</p>
        {history.last_performed && (
          <p>
            Last performed <LocalTime value={history.last_performed} />
          </p>
        )}
        {!exercise.archived_at && <Link href={detail}>Exercise details</Link>}
      </div>
      {history.entries.length ? (
        <ol className="history-list">
          {history.entries.map((w) => (
            <li key={w.item_id}>
              <h2>{w.exercise_name_snapshot}</h2>
              <p>
                <LocalTime value={w.finished_at} />
              </p>
              <ol className="performance-list">
                {w.sets.map((s, i) => (
                  <li key={s.id}>
                    <span>
                      {s.set_type === "warm_up" ? "W" : i + 1} ·{" "}
                      {setTypes[s.set_type]}
                    </span>
                    <strong>
                      {performanceLabel(
                        s,
                        unit,
                        s.logging_kind ?? w.logging_kind,
                      )}
                    </strong>
                  </li>
                ))}
              </ol>
              <Link href={`/history/${w.id}`}>
                View {friendlyWorkoutName(w.name)} →
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <section className="empty-state">
          <h2>No completed performances yet.</h2>
          <p>
            Completed sets for this exercise will appear here. Suggestions and
            unfinished sets are never treated as performed work.
          </p>
          <Link href="/workout">Record Workout</Link>
        </section>
      )}
      <div className="history-pagination">
        {query.cursor && <Link href={historyPath}>Newest performances</Link>}
        {hasMore && last && (
          <Link
            href={`${historyPath}${historyPath.includes("?") ? "&" : "?"}${new URLSearchParams({ cursor: cursorFor(last.finished_at, last.id) })}`}
          >
            Older performances →
          </Link>
        )}
      </div>
    </>
  );
}
