"use client";
import { useActionState, useState } from "react";
import {
  setExercisePreference,
  archiveExercise,
} from "@/features/exercises/actions";
import type {
  Exercise,
  MutationState,
  Preference,
} from "@/features/exercises/types";
import { Button } from "@/components/ui/button";
const empty: MutationState = {};
export function FavoriteButton({
  exercise,
  favorite,
}: {
  exercise: Exercise;
  favorite: boolean;
}) {
  const [state, action, pending] = useActionState(setExercisePreference, empty);
  return (
    <form action={action} className="favorite-form">
      <input type="hidden" name="id" value={exercise.id} />
      <input type="hidden" name="kind" value="favorite" />
      <input type="hidden" name="value" value={favorite ? "false" : "true"} />
      <button
        className="favorite-button"
        aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${exercise.name}`}
        aria-pressed={favorite}
        disabled={pending}
        aria-busy={pending}
      >
        {favorite ? "♥" : "♡"}
      </button>
      {state.error && (
        <p role="alert" className="auth-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
export function PreferenceControl({
  exerciseId,
  preference,
}: {
  exerciseId: string;
  preference: Preference["preference"];
}) {
  const [state, action, pending] = useActionState(setExercisePreference, empty);
  const [value, setValue] = useState(preference);
  return (
    <form action={action} className="library-form compact-form">
      <input type="hidden" name="id" value={exerciseId} />
      <input type="hidden" name="kind" value="preference" />
      <label htmlFor="exercise-preference">Recommendation preference</label>
      <select
        id="exercise-preference"
        name="value"
        value={value}
        onChange={(e) => setValue(e.target.value as Preference["preference"])}
        disabled={pending}
      >
        <option value="neutral">Neutral</option>
        <option value="preferred">Prefer this exercise</option>
        <option value="avoid">Avoid recommendations</option>
      </select>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save preference"}
      </Button>
      {state.error && (
        <p role="alert" className="auth-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="auth-success">
          {state.success}
        </p>
      )}
    </form>
  );
}
export function ArchiveControl({ id }: { id: string }) {
  const [state, action, pending] = useActionState(archiveExercise, empty);
  return (
    <section className="library-section">
      <h2>Archive this exercise</h2>
      <p>
        Remove it from your library and suggestions. Past workout references and
        snapshots stay intact.
      </p>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Archiving…" : "Archive exercise"}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="auth-error">
          {state.error}
        </p>
      )}
    </section>
  );
}
