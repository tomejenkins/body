"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { startSuggestedWorkout } from "@/features/workouts/suggested-actions";
import type { Taxon } from "@/features/exercises/types";
import { muscleLabel } from "@/features/workouts/suggested-shell";
import { StartBlankWorkout } from "./workout-controls";
export function WorkoutSetup({
  muscles,
  counts,
  request,
}: {
  muscles: Taxon[];
  counts: Record<string, number>;
  request: string;
}) {
  const [primary, setPrimary] = useState(""),
    [secondary, setSecondary] = useState("");
  const [state, action, busy] = useActionState(startSuggestedWorkout, {});
  const count = (counts[primary] ?? 0) + (counts[secondary] ?? 0);
  return (
    <section className="workout-setup" aria-label="Workout setup">
      <p>Pick your focus. Choose exercises as you train.</p>
      <form action={action}>
        <input type="hidden" name="request" value={request} />
        <div className="setup-field">
          <label htmlFor="primary-muscle">Primary Muscle Group</label>
          <select
            id="primary-muscle"
            name="primary"
            required
            value={primary}
            onChange={(e) => {
              setPrimary(e.target.value);
              if (secondary === e.target.value) setSecondary("");
            }}
          >
            <option value="">Choose a muscle group</option>
            {muscles.map((m) => (
              <option value={m.id} key={m.id}>
                {muscleLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="setup-field">
          <label htmlFor="secondary-muscle">
            Secondary Muscle Group{" "}
            <span className="optional-label">Optional</span>
          </label>
          <select
            id="secondary-muscle"
            name="secondary"
            value={secondary}
            onChange={(e) => setSecondary(e.target.value)}
          >
            <option value="">None</option>
            {muscles.map((m) => (
              <option value={m.id} key={m.id} disabled={m.id === primary}>
                {muscleLabel(m)}
              </option>
            ))}
          </select>
        </div>
        {primary && (
          <p className="setup-hint" role="status">
            {count} suggested {count === 1 ? "movement" : "movements"}.{" "}
            {count < (secondary ? 4 : 2)
              ? "Fewer supported movements are available for this focus."
              : "Two complementary movements per muscle."}{" "}
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
