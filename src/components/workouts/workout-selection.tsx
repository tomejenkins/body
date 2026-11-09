import Link from "next/link";
import { randomUUID } from "node:crypto";
import { loadStartOptions } from "@/features/workout-selection/queries";
import { SelectionForm } from "./selection-form";
import { SaveFavorite } from "./save-favorite";
import { ScheduleDecisions } from "./schedule-decisions";
export async function WorkoutSelection({
  activeSession,
  hideEmpty = false,
}: {
  activeSession?: string;
  hideEmpty?: boolean;
}) {
  const options = await loadStartOptions(),
    a = options.assignment,
    active = activeSession ?? options.activeSession;
  const fields: Record<string, string | number> = a
    ? {
        assignment: a.id,
        version: a.version,
        expected: a.cursor.workIndex,
        revision: a.cursor.decisionRevision,
      }
    : {};
  if (hideEmpty && !a && !options.favorites.length) return null;
  const recommended = a?.days.find((d) => d.recommended);
  return (
    <div className="workout-selection" aria-label="Workout selection">
      {active && (
        <p className="selection-resume">
          Your active workout takes priority. Resume above; your saved work and
          drafts stay available.
        </p>
      )}
      {a ? (
        <>
          {recommended && (
            <section
              className="recommended-workout"
              aria-label="Recommended workout"
            >
              <span className="selection-context">
                Recommended · Current Program
              </span>
              <h2>
                Workout {recommended.number} · {recommended.name}
              </h2>
              {recommended.partialSession && (
                <p className="set-source">
                  Partial training recorded. Retry, or open Plan next workout to
                  accept the partial.
                </p>
              )}
              <p>
                {a.name} · Rotation {a.cursor.rotation + 1}
              </p>
              {a.cursor.readyOn > a.today && (
                <p className="set-source">
                  {a.cursor.deferredUntil
                    ? "Deferred / ready from:"
                    : "Recovery guidance:"}{" "}
                  {a.cursor.readyOn} ({a.timezone}). You may choose to train
                  earlier.
                </p>
              )}
              <SelectionForm
                kind="start"
                fields={{
                  ...fields,
                  day: recommended.id,
                  request: randomUUID(),
                }}
                label="Start recommended workout"
                disabled={!!active}
              />
              <SaveFavorite
                type="program_day"
                source={a.version}
                day={recommended.id}
                name={recommended.name}
              />
            </section>
          )}
          {a.cursor.complete && (
            <p>
              Program complete. You can deliberately start an additional
              rotation.
            </p>
          )}
          <details className="program-workout-options">
            <summary>Other Program Workouts</summary>
            {a.days.every((d) => d.recommended) && (
              <p>No other training days in this program.</p>
            )}
            <ul>
              {a.days
                .filter((d) => !d.recommended)
                .map((d) => (
                  <li key={d.id}>
                    <h3>
                      Workout {d.number} · {d.name}
                    </h3>
                    <p className="set-source">
                      {d.completed
                        ? "Completed in this rotation · repeat keeps other positions pending"
                        : d.resolved
                          ? d.resolution === "skip"
                            ? "Skipped this rotation · not completed training"
                            : "Partial accepted · scheduling only"
                          : d.partialSession
                            ? "Partial training · retry this occurrence"
                            : "Upcoming alternative"}{" "}
                      · Rotation {a.cursor.rotation + 1}
                    </p>
                    <SelectionForm
                      kind="start"
                      fields={{ ...fields, day: d.id, request: randomUUID() }}
                      label={`${d.completed || d.resolved ? "Repeat" : "Start"} ${d.name}`}
                      disabled={!!active}
                    />
                    <SaveFavorite
                      type="program_day"
                      source={a.version}
                      day={d.id}
                      name={d.name}
                    />
                  </li>
                ))}
            </ul>
          </details>
          <ScheduleDecisions assignment={a} disabled={!!active} />
        </>
      ) : (
        <p className="set-source">
          <Link href="/programs">
            Choose a program or initialize its calendar
          </Link>{" "}
          to see your next prescribed workout here.
        </p>
      )}
      <section className="favorite-workouts" aria-label="Your Favorites">
        <h2>Your Favorites</h2>
        <p className="set-source">
          Reusable, independent workouts. They do not resolve assigned program
          days.
        </p>
        {options.favorites.length ? (
          <ul>
            {options.favorites.map((f) => (
              <li key={f.id}>
                <div>
                  <h3>{f.name}</h3>
                  <p>
                    {f.movements} movements ·{" "}
                    {f.sourceType === "program_day"
                      ? `${f.attribution.program} · ${f.attribution.day}`
                      : `From ${f.attribution.workout}`}
                  </p>
                </div>
                <SelectionForm
                  kind="start"
                  fields={{ favorite: f.id, request: randomUUID() }}
                  label={`Start ${f.name}`}
                  disabled={!!active}
                />
                <details>
                  <summary>Manage {f.name}</summary>
                  <SelectionForm
                    kind="manage"
                    fields={{ favorite: f.id, operation: "rename" }}
                    label="Rename Favorite"
                  >
                    <label>
                      New name
                      <input
                        name="name"
                        defaultValue={f.name}
                        required
                        maxLength={100}
                      />
                    </label>
                  </SelectionForm>
                  <SelectionForm
                    kind="manage"
                    fields={{ favorite: f.id, operation: "remove" }}
                    label="Remove Favorite"
                  >
                    <label className="check-label">
                      <input
                        type="checkbox"
                        name="confirmed"
                        value="yes"
                        required
                      />
                      Remove this shortcut; keep existing history
                    </label>
                  </SelectionForm>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No favorites yet. Save a program day or a completed ad-hoc workout.
          </p>
        )}
      </section>
    </div>
  );
}
