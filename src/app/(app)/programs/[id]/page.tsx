import { StartProgramWorkout } from "@/components/programs/start-program-workout";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOfficialProgram } from "@/features/programs/library-queries";
import { experienceLabel, goalLabel } from "@/features/programs/catalog";
import { ProgramCover } from "@/components/programs/program-cover";
import { ProgramDescription } from "@/components/programs/program-description";
import { ProgramBadges } from "@/components/programs/program-badges";
export const metadata = { title: "Program details" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const loaded = await loadOfficialProgram((await params).id);
  if (!loaded) notFound();
  const { definition: d, version, exercises, equipment, patterns } = loaded,
    p = d.program;
  return (
    <article className="program-detail">
      <Link href="/programs">← Programs</Link>
      <ProgramCover media={d.media?.cover ?? null} title={p.name} priority />
      <header>
        <p className="eyebrow">Original Body program · Version {version}</p>
        <ProgramBadges program={loaded} now={new Date()} />
        <h1>{p.name}</h1>
        <p className="program-summary">{p.summary}</p>
      </header>
      <dl className="program-overview">
        <div>
          <dt>Goal</dt>
          <dd>{goalLabel(p.objective)}</dd>
        </div>
        <div>
          <dt>Experience</dt>
          <dd>{experienceLabel(p.experience_level)}</dd>
        </div>
        <div>
          <dt>Suggested frequency</dt>
          <dd>
            {p.sessions_min === p.sessions_max
              ? p.sessions_min
              : `${p.sessions_min}–${p.sessions_max}`}{" "}
            sessions / week
          </dd>
        </div>
        <div>
          <dt>Rotation</dt>
          <dd>
            {d.days.filter((day) => !day.is_rest_day).length} workouts ·{" "}
            {d.days.filter((day) => day.is_rest_day).length} rest breaks
          </dd>
        </div>
        <div>
          <dt>Session guidance</dt>
          <dd>
            About {p.session_minutes_min}–{p.session_minutes_max} minutes;
            adjust rest as needed
          </dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>
            {p.duration_rotations
              ? `${p.duration_rotations} rotations`
              : "Open-ended"}
          </dd>
        </div>
      </dl>
      <div className="program-tags">
        {d.tags?.map((t) => (
          <span key={t.slug}>{t.name}</span>
        ))}
      </div>
      <section aria-label="Program description">
        <ProgramDescription
          text={p.description_markdown
            .replace(
              /Following and scheduling programs arrives in Phase 7\.3\./g,
              "",
            )
            .replace(/\bpositions\b/g, "steps")
            .replace(/\bposition\b/g, "step")}
        />
      </section>
      <section className="library-section">
        <h2>Equipment</h2>
        <p>
          {equipment
            .filter((e) => e.name !== "None")
            .map((e) => e.name)
            .join(" · ")}
        </p>
      </section>
      <section className="program-workouts">
        <h2>The rotation</h2>
        <p>
          Follow the workout order. Take the rest breaks shown, and add recovery
          when needed.
        </p>
        <ol className="program-days">
          {d.days.map((day) => (
            <li
              key={day.id}
              className={
                day.is_rest_day ? "program-day program-rest-day" : "program-day"
              }
            >
              <h3>
                {day.is_rest_day
                  ? "Rest"
                  : `Workout ${d.days.filter((w) => !w.is_rest_day && w.cycle_position <= day.cycle_position).length}`}{" "}
                · {day.name}
              </h3>
              {day.is_rest_day ? (
                <p>Rest day · Recover before the next workout.</p>
              ) : (
                <>
                  <p>{day.focus}</p>
                  <StartProgramWorkout
                    version={loaded.versionId}
                    day={day.cycle_position}
                    number={
                      d.days.filter(
                        (w) =>
                          !w.is_rest_day &&
                          w.cycle_position <= day.cycle_position,
                      ).length
                    }
                    request={crypto.randomUUID()}
                  />
                  <ol className="program-slots">
                    {day.slots.map((slot) => {
                      const rule = d.rules.find(
                        (r) => r.id === slot.progression_rule_id,
                      );
                      return (
                        <li key={slot.id}>
                          <h4>
                            <Link href={`/exercises/${slot.exercise_id}`}>
                              {exercises.get(slot.exercise_id) ??
                                "Exercise unavailable"}
                            </Link>
                          </h4>
                          <p className="program-meta">
                            {patterns.get(slot.movement_pattern_id)} ·{" "}
                            {slot.target_sets} working sets ·{" "}
                            {slot.target_reps_min === slot.target_reps_max
                              ? slot.target_reps_min
                              : `${slot.target_reps_min}–${slot.target_reps_max}`}{" "}
                            reps
                          </p>
                          <ul className="program-prescriptions">
                            {slot.sets.map((set) => (
                              <li key={set.position}>
                                Set {set.position}:{" "}
                                {set.reps_min === set.reps_max
                                  ? set.reps_min
                                  : `${set.reps_min}–${set.reps_max}`}{" "}
                                reps
                                {set.effort_scale &&
                                  ` · Target ${set.effort_scale.toUpperCase()} ${set.effort_value === 5 && set.effort_scale === "rir" ? "5+" : set.effort_value}`}
                                {set.intended_to_failure &&
                                  " · Optional To Failure intent"}
                              </li>
                            ))}
                          </ul>
                          <p className="program-meta">
                            Rest guidance: {slot.rest_seconds}–
                            {slot.rest_seconds_max} seconds; longer when needed.
                          </p>
                          {slot.alternatives.length > 0 && (
                            <p>
                              Alternatives:{" "}
                              {slot.alternatives.map((a, i) => (
                                <span key={a.exercise_id}>
                                  {i > 0 ? " · " : ""}
                                  <Link href={`/exercises/${a.exercise_id}`}>
                                    {exercises.get(a.exercise_id) ??
                                      "Exercise unavailable"}
                                  </Link>
                                </span>
                              ))}
                            </p>
                          )}
                          <p className="program-meta">
                            {rule?.strategy === "linear_load"
                              ? "Progression: small load steps after controlled completion; repeat load when needed."
                              : "Progression: build reps within the range before increasing load."}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
              <p className="program-meta">{day.notes}</p>
            </li>
          ))}
        </ol>
      </section>
      <aside className="library-section">
        <h2>Choose as you train.</h2>
        <p>
          Prescriptions describe planned work, not performance you have
          completed. Start a workout above and choose exercises as you train.
          Calendar scheduling and program editing are separate flows.
        </p>
        <p>
          Published by Body · Original programming · Initial publication{" "}
          {new Date(loaded.publishedAt).toISOString().slice(0, 10)} (UTC)
        </p>
      </aside>
    </article>
  );
}
