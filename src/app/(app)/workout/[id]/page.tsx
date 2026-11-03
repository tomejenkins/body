import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkout } from "@/features/workouts/queries";
import { isUuid } from "@/features/exercises/validation";
import { describeStatus, orderedItems } from "@/features/workouts/lifecycle";
import { ExerciseThumbnail } from "@/components/exercises/exercise-thumbnail";
import {
  CloseWorkout,
  ItemControls,
} from "@/components/workouts/workout-controls";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Your workout" };
function timestamp(value: string) {
  return (
    new Date(value).toISOString().replace("T", " · ").slice(0, 21) + " UTC"
  );
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const workout = await loadWorkout(id);
  if (!workout) notFound();
  const active = workout.status === "in_progress";
  const items = orderedItems(workout.items);
  return (
    <>
      <div className="page-heading">
        <Link href="/workout">← Workout</Link>
        <p className="eyebrow">{describeStatus(workout.status)}</p>
        <h1>{workout.name}</h1>
        <p className="intro">
          Started{" "}
          <time dateTime={workout.startedAt}>
            {timestamp(workout.startedAt)}
          </time>
        </p>
        {workout.finishedAt && (
          <p>
            Closed{" "}
            <time dateTime={workout.finishedAt}>
              {timestamp(workout.finishedAt)}
            </time>
          </p>
        )}
      </div>
      {active && (
        <div className="workout-toolbar">
          <Button asChild>
            <Link href={`/workout/${id}/select`}>Add exercises</Link>
          </Button>
          <p>
            Selections are saved automatically. Sets, weights and reps come
            next.
          </p>
        </div>
      )}
      <p role="status" aria-live="polite" className="library-count">
        {items.length} {items.length === 1 ? "exercise" : "exercises"} selected
      </p>
      {items.length === 0 ? (
        <section className="empty-state">
          <h2>
            {active ? "No exercises selected yet." : "No exercises selected."}
          </h2>
          <p>
            {active
              ? "Choose a movement from your library to get started."
              : "This workout closed without any selected exercises."}
          </p>
        </section>
      ) : (
        <ol className="workout-items" aria-label="Selected exercises">
          {items.map((item, index) => (
            <li key={item.id} className="workout-item">
              <div className="workout-item-heading">
                <ExerciseThumbnail visual={item.visual} />
                <span className="workout-position">{index + 1}</span>
                <h2>{item.name}</h2>
              </div>
              {active && (
                <ItemControls
                  sessionId={id}
                  item={item}
                  first={index === 0}
                  last={index === items.length - 1}
                />
              )}
            </li>
          ))}
        </ol>
      )}
      {active ? (
        <section className="workout-ending">
          <h2>Ready to close?</h2>
          <p>
            Finish to keep this session as completed, or abandon it
            intentionally. Neither action invents logged sets. Once closed,
            selections can’t be changed here.
          </p>
          <div className="workout-ending-actions">
            <CloseWorkout sessionId={id} outcome="completed" />
            <details>
              <summary>Abandon instead</summary>
              <p>
                Your selected exercises and session record will be retained.
              </p>
              <CloseWorkout sessionId={id} outcome="abandoned" />
            </details>
          </div>
        </section>
      ) : (
        <section className="library-section">
          <p>
            {workout.completionStatus === "none"
              ? "No completed sets were recorded. This status describes the workout session only."
              : "Previously recorded work is preserved."}
          </p>
          <Link href="/workout">Back to workouts</Link>
        </section>
      )}
    </>
  );
}
