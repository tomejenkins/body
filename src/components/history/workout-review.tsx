import { favoriteSource } from "@/features/completion/model";
import {
  groupItems,
  memberKey,
  orderedGroups,
} from "@/features/grouping/model";
import type { WorkoutItem } from "@/features/workouts/types";
import { WorkoutRetention } from "./workout-retention";
import { loadTrainingSummary } from "@/features/completion/statistics";
import { progressionFeedback } from "@/features/programs/progression-feedback";
import { SaveFavorite } from "@/components/workouts/save-favorite";
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
  const [achievements, suggestions, outcomes, statistics] = await Promise.all([
    workout.archivedAt ? Promise.resolve([]) : loadAchievements(workout.id),
    workout.archivedAt
      ? Promise.resolve({})
      : loadProgressionSuggestions(workout),
    workout.archivedAt ? Promise.resolve([]) : loadProgramOutcomes(workout),
    workout.status === "completed" && !workout.archivedAt
      ? loadTrainingSummary(workout.id)
      : Promise.resolve(null),
  ]);
  const suggestionItems = progressionFeedback(workout.items, suggestions);
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
  const source = favoriteSource(workout);
  const order = workout.groupOrder ?? [
    ...new Map(
      workout.items.map((item) => {
        const member = {
          type: item.programMovementId
            ? ("movement" as const)
            : ("selection" as const),
          id: item.programMovementId ?? item.id,
        };
        return [memberKey(member), member] as const;
      }),
    ).values(),
  ];
  const groups = orderedGroups(workout.groups ?? [], order.map(memberKey));
  function renderRecordedItem(item: WorkoutItem, label?: string) {
    return (
      <li className="workout-item" key={item.id}>
        <div className="workout-item-heading">
          <ExerciseThumbnail visual={item.visual} />
          <h2>
            {label ? `${label} · ` : ""}
            {item.name}
          </h2>
        </div>
        <p className="auth-links">
          <Link href={`/exercises/${item.exerciseId}/history`}>Look Back</Link>
          <Link href={`/exercises/${item.exerciseId}`}>Exercise details</Link>
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
    );
  }
  return (
    <article className="history-review refined-screen">
      <div className="page-heading">
        <Link
          href={workout.archivedAt ? "/history?filter=archived" : "/history"}
        >
          ← History
        </Link>
        {workout.archivedAt && (
          <>
            <p role="status" className="workout-history-status">
              Archived Workout
            </p>
            <p>
              Saved details are preserved. This workout is excluded from active
              records and progress.
            </p>
          </>
        )}
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
          <>
            <p>Saved workout · Read only</p>
            {workout.status === "completed" && !workout.archivedAt && (
              <Link href={`/workout/${workout.id}/complete`}>
                Workout Summary
              </Link>
            )}
          </>
        )}
      </div>
      {workout.continuity?.closure_reason === "inactivity" && (
        <p role="status" className="draft-warning">
          {closureExplanation("inactivity")}
        </p>
      )}
      {workout.favoriteAttribution && (
        <p className="set-source">
          Independent Favorite · {workout.favoriteAttribution.favorite}
          {workout.favoriteAttribution.program
            ? ` · ${workout.favoriteAttribution.program} · ${workout.favoriteAttribution.day}`
            : ""}
        </p>
      )}
      {workout.status === "completed" && !workout.archivedAt && (
        <SaveFavorite
          type={source.type}
          source={source.source}
          day={"day" in source ? source.day : undefined}
        />
      )}
      {!workout.archivedAt && <ClosedDrafts workout={workout} />}
      <Achievements achievements={achievements} unit={workout.weightUnit} />
      {workout.isProgram &&
        workout.status === "completed" &&
        !workout.archivedAt && (
          <>
            <section aria-label="Next time" className="program-progress">
              <h2>Next time</h2>
              <p>
                {outcomes.filter((m) => m.completed >= m.required).length}/
                {outcomes.length} movements complete ·{" "}
                {outcomes.reduce((n, m) => n + m.completed, 0)}/
                {outcomes.reduce((n, m) => n + m.required, 0)} prescribed sets
                completed · {outcomes.reduce((n, m) => n + m.repsAchieved, 0)}{" "}
                met the rep target
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
                  {i.name}: suggested {i.suggestion.display}{" "}
                  {workout.weightUnit}
                  {i.suggestion.reps
                    ? ` · ${i.suggestion.reps} reps`
                    : ""}. {i.suggestion.basis}
                </p>
              ))}
              {!Object.keys(suggestions).length && (
                <p>
                  No load suggestion yet. Keep building recorded performance.
                </p>
              )}
            </section>
            <ProgramProgress session={workout.id} />
          </>
        )}
      {statistics && (
        <p className="qualifying-training-summary">
          {statistics.working_sets} qualifying working sets ·{" "}
          {statistics.exercises_performed} exercises performed
        </p>
      )}
      <p className="logging-summary">
        {workout.items.length} exercises selected · {completed} total completed
        sets · {pending} pending sets
      </p>
      {completed === 0 && <p>No completed sets were recorded.</p>}
      <ol
        className="workout-items history-detail"
        aria-label="Recorded exercises"
      >
        {!groups.length
          ? workout.items.map((item) => renderRecordedItem(item))
          : order.map((member) => {
              const group = groups.find((g) =>
                g.members.some((m) => memberKey(m) === memberKey(member)),
              );
              if (group) {
                const anchor = order.find((m) =>
                  group.members.some((gm) => memberKey(gm) === memberKey(m)),
                );
                if (!anchor || memberKey(anchor) !== memberKey(member))
                  return null;
                return (
                  <li key={`group:${group.id}`} className="history-superset">
                    <h2>Superset {groups.indexOf(group) + 1}</h2>
                    <p className="set-source">Final workout grouping</p>
                    <ol>
                      {group.members.flatMap((m, i) => {
                        const items = groupItems(workout, m);
                        return items.length
                          ? items.map((item) =>
                              renderRecordedItem(item, `A${i + 1}`),
                            )
                          : [
                              <li key={memberKey(m)}>
                                A{i + 1} ·{" "}
                                {workout.groupLabels?.[memberKey(m)] ??
                                  "Movement"}
                                <p>No exercise selected.</p>
                              </li>,
                            ];
                      })}
                    </ol>
                  </li>
                );
              }
              return groupItems(workout, member).map((item) =>
                renderRecordedItem(item),
              );
            })}
      </ol>
      {!workout.items.length && (
        <section className="empty-state">
          <h2>No exercises recorded.</h2>
          <p>This workout is preserved without invented performance.</p>
        </section>
      )}
      {workout.status !== "in_progress" && (
        <WorkoutRetention
          key={`${workout.id}:${workout.retentionRevision}`}
          session={workout.id}
          revision={workout.retentionRevision ?? 0}
          archived={!!workout.archivedAt}
          request={crypto.randomUUID()}
        />
      )}
    </article>
  );
}
