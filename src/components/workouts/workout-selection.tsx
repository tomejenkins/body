import { Button } from "@/components/ui/button";
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
      {a ? (
        <>
          {recommended && (
            <section
              className="recommended-workout"
              aria-label="Recommended workout"
            >
              <span className="selection-context">UP NEXT IN YOUR PROGRAM</span>
              <h2>
                Workout {recommended.number} — {recommended.name}
              </h2>
              <span className="set-source">Recommended</span>
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
                label="Start Workout"
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
            <summary>Choose a different program workout</summary>
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
        <Link className="selection-browse" href="/programs">
          Browse Programs
        </Link>
      )}
      {!active && (
        <Button variant={a ? "outline" : "default"} asChild>
          <Link href="/workout/new">Start Other Workout</Link>
        </Button>
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
                    {f.movements} {f.movements === 1 ? "movement" : "movements"}{" "}
                    ·{" "}
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
