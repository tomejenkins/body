import { ProgramProgress } from "@/components/programs/program-progress";
import {
  loadProgramOutcomes,
  loadProgressionSuggestions,
} from "@/features/programs/progression-queries";
import { effortSummary } from "@/features/sets/effort";
import {
  qualifiedDuration,
  closureExplanation,
} from "@/features/continuity/model";
import { ClosedDrafts } from "@/components/continuity/closed-drafts";
import { loadAchievements } from "@/features/records/queries";
import { Achievements } from "@/components/records/achievements";
import Link from "next/link";
import type { Workout } from "@/features/workouts/types";
import {
  friendlyWorkoutName,
  historyStatus,
  durationLabel,
  performanceLabel,
} from "@/features/history/model";
import { setTypes } from "@/features/sets/model";
import { LocalTime } from "./local-time";
import { ExerciseThumbnail } from "@/components/exercises/exercise-thumbnail";
export async function WorkoutReview({ workout }: { workout: Workout }) {
  const [achievements, suggestions, outcomes] = await Promise.all([
    loadAchievements(workout.id),
    loadProgressionSuggestions(workout),
    loadProgramOutcomes(workout),
  ]);
  const suggestionItems = workout.items
    .filter((i) => suggestions[i.id])
    .sort(
      (a, b) =>
        ({ increase: 0, reps: 1, estimate: 2, hold: 3 })[
          suggestions[a.id].action
        ] -
          { increase: 0, reps: 1, estimate: 2, hold: 3 }[
            suggestions[b.id].action
          ] || a.position - b.position,
    )
    .slice(0, 3);
  const sets = workout.items.flatMap((item) =>
    item.sets.filter((s) => !s.deleted_at),
  );
  const completed = workout.items
    .filter(
      (item) =>
        item.loggingKind !== "duration" && item.loggingKind !== "assisted",
    )
    .flatMap((item) => item.sets)
    .filter((s) => !s.deleted_at && s.status === "completed").length;
  const pending = sets.filter((s) => s.status !== "completed").length;
  return (
    <>
      <div className="page-heading">
        <Link href="/history">← History</Link>
        <p className="workout-history-status">
          {historyStatus(workout.status, workout.completionStatus)}
        </p>
        <h1>{friendlyWorkoutName(workout.name)}</h1>
        <p>
          <LocalTime value={workout.startedAt} />
          {workout.continuity
            ? ` · ${qualifiedDuration(workout.continuity)}`
            : durationLabel(workout.startedAt, workout.finishedAt)
              ? ` · Elapsed session (legacy): ${durationLabel(workout.startedAt, workout.finishedAt)}`
              : ""}
        </p>
        {workout.finishedAt && (
          <p>
            Finished <LocalTime value={workout.finishedAt} />
          </p>
        )}
        {workout.status === "in_progress" ? (
          <Link href={`/workout/${workout.id}`}>Resume Workout</Link>
        ) : (
          <p>Saved workout · Read only</p>
        )}
      </div>
      {workout.continuity?.closure_reason === "inactivity" && (
        <p role="status" className="draft-warning">
          {closureExplanation("inactivity")}
        </p>
      )}
      <ClosedDrafts workout={workout} />
      <Achievements achievements={achievements} unit={workout.weightUnit} />
      {workout.isProgram && workout.status === "completed" && (
        <>
          <section aria-label="Next time" className="program-progress">
            <h2>Next time</h2>
            <p>
              {outcomes.filter((m) => m.completed >= m.required).length}/
              {outcomes.length} movements complete ·{" "}
              {outcomes.reduce((n, m) => n + m.completed, 0)}/
              {outcomes.reduce((n, m) => n + m.required, 0)} prescribed sets
              completed · {outcomes.reduce((n, m) => n + m.repsAchieved, 0)} met
              the rep target
            </p>
            <details>
              <summary>Movement targets</summary>
              {outcomes.map((m) => (
                <p key={m.movement}>
                  Movement {m.movement}: {m.completed}/{m.required} sets ·{" "}
                  {m.repsAchieved} met the rep target
                </p>
              ))}
            </details>
            {suggestionItems.map((i) => (
              <p key={i.id}>
                {i.name}: suggested {suggestions[i.id].display}{" "}
                {workout.weightUnit}
                {suggestions[i.id].reps
                  ? ` · ${suggestions[i.id].reps} reps`
                  : ""}
                . {suggestions[i.id].basis}
              </p>
            ))}
            {!Object.keys(suggestions).length && (
              <p>No load suggestion yet. Keep building recorded performance.</p>
            )}
          </section>
          <ProgramProgress session={workout.id} />
        </>
      )}
      <p className="logging-summary">
        {workout.items.length} exercises · {completed} completed sets ·{" "}
        {pending} pending sets
      </p>
      {completed === 0 && <p>No completed sets were recorded.</p>}
      <ol
        className="workout-items history-detail"
        aria-label="Recorded exercises"
      >
        {workout.items.map((item) => (
          <li className="workout-item" key={item.id}>
            <div className="workout-item-heading">
              <ExerciseThumbnail visual={item.visual} />
              <h2>{item.name}</h2>
            </div>
            <p className="auth-links">
              <Link href={`/exercises/${item.exerciseId}/history`}>
                Look Back
              </Link>
              <Link href={`/exercises/${item.exerciseId}`}>
                Exercise details
              </Link>
            </p>
            <ol className="performance-list">
              {item.sets
                .filter((s) => !s.deleted_at)
                .map((s, i) => (
                  <li key={s.id}>
                    <span>
                      {s.set_type === "warm_up" ? "W" : i + 1} ·{" "}
                      {setTypes[s.set_type]}
                      {effortSummary(s) && ` · ${effortSummary(s)}`}
                    </span>
                    <strong>
                      {performanceLabel(
                        s,
                        workout.weightUnit,
                        item.loggingKind ?? "legacy",
                      )}
                    </strong>
                    <span>
                      {s.status === "completed"
                        ? "Completed"
                        : s.status === "skipped"
                          ? "Skipped"
                          : "Not completed"}
                    </span>
                  </li>
                ))}
            </ol>
            {!item.sets.some((s) => !s.deleted_at) && <p>No sets recorded.</p>}
          </li>
        ))}
      </ol>
      {!workout.items.length && (
        <section className="empty-state">
          <h2>No exercises recorded.</h2>
          <p>This workout is preserved without invented performance.</p>
        </section>
      )}
    </>
  );
}
