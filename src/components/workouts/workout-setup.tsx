"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { startSuggestedWorkout } from "@/features/workouts/suggested-actions";
import type { SetupFocus } from "@/features/workouts/suggested-shell";
import { StartBlankWorkout } from "./workout-controls";
export function WorkoutSetup({
  focuses,
  counts,
  request,
}: {
  focuses: SetupFocus[];
  counts: Record<string, number>;
  request: string;
}) {
  const [primary, setPrimary] = useState(""),
    [secondary, setSecondary] = useState(""),
    [emphasis, setEmphasis] = useState("balanced");
  const [state, action, busy] = useActionState(startSuggestedWorkout, {});
  const focus = focuses.find((f) => f.id === primary);
  const count = counts[`${primary}:${secondary}:${emphasis}`] ?? 0;
  return (
    <section className="workout-setup" aria-label="Workout setup">
      <p>Pick your focus. Choose exercises as you train.</p>
      <form action={action}>
        <input type="hidden" name="request" value={request} />
        <div className="setup-field">
          <label htmlFor="primary-muscle">Primary Focus</label>
          <select
            id="primary-muscle"
            name="primary"
            required
            value={primary}
            onChange={(e) => {
              setPrimary(e.target.value);
              setEmphasis("balanced");
              if (secondary === e.target.value) setSecondary("");
            }}
          >
            <option value="">Choose a focus</option>
            {focuses.map((m) => (
              <option value={m.id} key={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
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
            {count} suggested {count === 1 ? "movement" : "movements"}.{" "}
            {count <
            (secondary
              ? 4
              : primary === "biceps" ||
                  primary === "triceps" ||
                  primary === "core"
                ? 3
                : 4)
              ? "Fewer supported movements are available for this focus."
              : ""}{" "}
            Exercises and weights stay unselected.
          </p>
        )}
        {state.error && <p role="alert">{state.error}</p>}
        <Button type="submit" disabled={busy || !count}>
          {busy ? "Opening workout…" : "Start Workout"}
        </Button>
      </form>
      <div className="setup-blank">
        <StartBlankWorkout />
      </div>
    </section>
  );
}
