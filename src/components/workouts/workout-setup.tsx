"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { startSuggestedWorkout } from "@/features/workouts/suggested-actions";
import type { SetupFocus } from "@/features/workouts/suggested-shell";
import { ExerciseSetup, type SetupExercise } from "./exercise-setup";
import { StartBlankWorkout } from "./workout-controls";
export function WorkoutSetup({
  focuses,
  counts,
  request,
  exercises,
  recentIds,
  exerciseRequest,
}: {
  focuses: SetupFocus[];
  counts: Record<string, number>;
  request: string;
  exercises: SetupExercise[];
  recentIds: string[];
  exerciseRequest: string;
}) {
  const [mode, setMode] = useState("movement");
  const [primary, setPrimary] = useState(""),
    [secondary, setSecondary] = useState(""),
    [emphasis, setEmphasis] = useState("balanced");
  const [state, action, busy] = useActionState(startSuggestedWorkout, {});
  const focus = focuses.find((f) => f.id === primary);
  const count = counts[`${primary}:${secondary}:${emphasis}`] ?? 0;
  return (
    <section className="workout-setup" aria-label="Workout setup">
      <div className="setup-mode" role="group" aria-label="Setup method">
        <Button
          className="setup-mode-toggle"
          variant="outline"
          type="button"
          onClick={() => setMode(mode === "movement" ? "exercise" : "movement")}
        >
          {mode === "movement"
            ? "Choose by Exercise Instead"
            : "Movement Focus"}
        </Button>
      </div>
      <div hidden={mode !== "exercise"}>
        <ExerciseSetup
          exercises={exercises}
          recentIds={recentIds}
          request={exerciseRequest}
        />
      </div>
      <div hidden={mode !== "movement"}>
        <form action={action}>
          <input type="hidden" name="request" value={request} />
          <fieldset className="focus-tiles">
            <legend>Primary Focus</legend>
            {[{ id: "full_body", label: "Full Body" }, ...focuses].map((m) => (
              <label key={m.id}>
                <input
                  type="radio"
                  name="primary"
                  value={m.id}
                  checked={primary === m.id}
                  onChange={() => {
                    setPrimary(m.id);
                    setEmphasis("balanced");
                    if (m.id === "full_body" || secondary === m.id)
                      setSecondary("");
                  }}
                />
                {m.label}
              </label>
            ))}
          </fieldset>
          {primary !== "full_body" && (
            <div className="setup-field">
              <label htmlFor="secondary-muscle">
                Secondary Focus <span className="optional-label">Optional</span>
              </label>
              <select
                id="secondary-muscle"
                name="secondary"
                value={secondary}
                onChange={(e) => setSecondary(e.target.value)}
              >
                <option value="">None</option>
                {focuses.map((m) => (
                  <option value={m.id} key={m.id} disabled={m.id === primary}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {focus && focus.emphasis.length > 0 && (
            <div className="setup-field">
              <label htmlFor="workout-emphasis">
                Emphasis <span className="optional-label">Optional</span>
              </label>
              <select
                id="workout-emphasis"
                name="emphasis"
                value={emphasis}
                onChange={(e) => setEmphasis(e.target.value)}
              >
                <option value="balanced">Balanced</option>
                {focus.emphasis.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {primary && (
            <p className="setup-hint" role="status">
              {primary === "full_body" && (
                <span>
                  Squat · Hinge · Push · Pull · Core
                  <br />
                </span>
              )}
              {count} suggested {count === 1 ? "movement" : "movements"}.{" "}
              {count <
              (primary === "full_body"
                ? 5
                : secondary
                  ? 4
                  : primary === "biceps" ||
                      primary === "triceps" ||
                      primary === "core"
                    ? 3
                    : 4)
                ? "Fewer supported movements are available for this focus."
                : ""}{" "}
            </p>
          )}
          {state.error && <p role="alert">{state.error}</p>}
          <Button type="submit" disabled={busy || !count}>
            {busy ? "Opening workout…" : "Start Workout"}
          </Button>
        </form>
        <details className="setup-blank">
          <summary>More options</summary>
          <StartBlankWorkout />
        </details>
      </div>
    </section>
  );
}
