import Link from "next/link";
import { CircleCheck, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Achievements } from "@/components/records/achievements";
import { SaveFavorite } from "@/components/workouts/save-favorite";
import { LocalTime } from "@/components/history/local-time";
import { friendlyWorkoutName } from "@/features/history/model";
import { completionDuration } from "@/features/completion/model";
import { progressionFeedback } from "@/features/programs/progression-feedback";
import type { Workout } from "@/features/workouts/types";
import type { loadCompletion } from "@/features/completion/queries";
export function WorkoutComplete({
  workout: w,
  summary: s,
  showAllAchievements = false,
}: {
  workout: Workout;
  summary: Awaited<ReturnType<typeof loadCompletion>>;
  showAllAchievements?: boolean;
}) {
  const duration = completionDuration(w),
    feedback = progressionFeedback(w.items, s.suggestions),
    partial = w.completionStatus === "partial",
    unsupported = w.items.some((i) =>
      ["duration", "assisted"].includes(i.loggingKind ?? ""),
    );
  const qualifier = duration.label.includes("legacy")
    ? "Legacy elapsed"
    : duration.label.startsWith("Estimated")
      ? "Estimated"
      : duration.label.startsWith("Effective")
        ? "Excludes pauses"
        : duration.label.startsWith("Elapsed")
          ? "Elapsed"
          : "";
  return (
    <article className="workout-completion">
      <header className="completion-heading">
        <CircleCheck size={30} aria-hidden="true" />
        <h1>Workout Complete!</h1>
        <h2>{friendlyWorkoutName(w.name)}</h2>
        {w.finishedAt && (
          <p>
            <LocalTime value={w.finishedAt} />
          </p>
        )}
        {w.favoriteAttribution && (
          <p className="set-source">
            Independent Favorite · {w.favoriteAttribution.favorite}
          </p>
        )}
        <p className="completion-private">
          <LockKeyhole size={12} aria-hidden="true" />
          Private workout · Saved
        </p>
      </header>
      <dl className="completion-statistics" aria-label="Workout statistics">
        <div aria-label={duration.detail}>
          <dt>Duration</dt>
          <dd>
            {duration.value === "Less than a minute"
              ? "<1 min"
              : duration.value}
          </dd>
          {qualifier && <small>{qualifier}</small>}
        </div>
        <div aria-label="Completed qualifying working sets">
          <dt>{unsupported ? "Strength sets" : "Working sets"}</dt>
          <dd>{s.statistics.working_sets}</dd>
          <small>Completed</small>
        </div>
        <div aria-label="Distinct exercise selections with qualifying performance">
          <dt>{unsupported ? "Strength exercises" : "Exercises"}</dt>
          <dd>{s.statistics.exercises_performed}</dd>
          <small>Performed</small>
        </div>
      </dl>
      {unsupported && (
        <p className="set-source">
          Other legacy timed or assisted entries remain in View Full Workout.
        </p>
      )}
      {!s.statistics.working_sets && (
        <p className="set-source">No qualifying working sets were recorded.</p>
      )}
      {s.achievements.featured.length ? (
        <>
          <Achievements
            achievements={s.achievements.featured}
            unit={w.weightUnit}
            compact
          />
          {s.achievements.additional.length > 0 && (
            <div className="completion-more">
              <Link
                prefetch={false}
                href={`/workout/${w.id}/complete?achievements=all#all-achievements`}
              >
                View All Achievements (
                {s.achievements.featured.length +
                  s.achievements.additional.length}
                )
              </Link>
              {showAllAchievements && (
                <section id="all-achievements">
                  <Achievements
                    achievements={s.achievements.additional}
                    unit={w.weightUnit}
                    compact
                    heading="More Personal Bests"
                  />
                </section>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="completion-saved">
          {s.statistics.working_sets
            ? "Workout saved. Your training adds to your progress."
            : "Workout saved."}
        </p>
      )}
      {w.isProgram && (
        <section
          className="completion-program"
          aria-label="Program workout summary"
        >
          <h2>
            {partial
              ? "Partial Workout"
              : w.completionStatus === "none"
                ? "Program work not completed"
                : "Program workout saved"}
          </h2>
          <p>
            {s.outcomes.filter((m) => m.completed >= m.required).length}/
            {s.outcomes.length} movements complete ·{" "}
            {s.outcomes.reduce((n, m) => n + m.completed, 0)}/
            {s.outcomes.reduce((n, m) => n + m.required, 0)} prescribed sets
            completed
          </p>
          {partial && (
            <>
              <p className="set-source">
                Accepting partial training is a separate scheduling decision.
              </p>
              <Link href="/workout?decisions=program#schedule-decisions">
                Review program schedule
              </Link>
            </>
          )}
        </section>
      )}
      {w.isProgram && (
        <section className="completion-next" aria-label="Next time">
          <h2>Next time</h2>
          {feedback.map((i) => (
            <p key={i.id}>
              <strong>{i.name}</strong>: suggested {i.suggestion.display}{" "}
              {w.weightUnit}
              {i.suggestion.reps ? ` · ${i.suggestion.reps} reps` : ""}.{" "}
              {i.suggestion.basis}
            </p>
          ))}
          {!feedback.length && (
            <p className="set-source">
              No load suggestion yet. Keep building recorded performance.
            </p>
          )}
        </section>
      )}
      <section className="completion-favorite" aria-label="Favorite shortcut">
        {s.favorite.saved ? (
          <p role="status">Saved as Favorite · {s.favorite.saved.name}</p>
        ) : s.favorite.eligible ? (
          s.favorite.atCapacity ? (
            <p>
              Your Favorites is full (100). Remove a shortcut before saving
              another.
            </p>
          ) : (
            <SaveFavorite
              type={s.favorite.source.type}
              source={s.favorite.source.source}
              day={
                "day" in s.favorite.source ? s.favorite.source.day : undefined
              }
              name={w.name}
            />
          )
        ) : null}
        {(s.favorite.saved || s.favorite.atCapacity) && (
          <Link href="/workout#favorites">Manage Favorites</Link>
        )}
      </section>
      <Button
        type="button"
        disabled
        variant="outline"
        className="completion-share"
      >
        Share to Feed · Coming Later
      </Button>
      <footer className="completion-actions">
        <Button asChild>
          <Link prefetch={false} href="/dashboard">
            Done
          </Link>
        </Button>
        <Link prefetch={false} href={`/history/${w.id}`}>
          View Full Workout
        </Link>
      </footer>
    </article>
  );
}
