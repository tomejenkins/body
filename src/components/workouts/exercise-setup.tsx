"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { startExerciseWorkout } from "@/features/workouts/exercise-setup-actions";
export type SetupExercise = { id: string; name: string };
export function ExerciseSetup({
  exercises,
  recentIds,
  request,
}: {
  exercises: SetupExercise[];
  recentIds: string[];
  request: string;
}) {
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const [state, action, busy] = useActionState(startExerciseWorkout, {});
  const available = exercises.filter((e) => !selected.includes(e.id));
  const results = query.trim()
    ? available
        .filter((e) =>
          e.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 20)
    : [];
  const recent = recentIds.flatMap((id) =>
    available.filter((e) => e.id === id),
  );
  const add = (id: string) =>
    setSelected((list) =>
      list.length < 6 && !list.includes(id) ? [...list, id] : list,
    );
  const move = (index: number, direction: number) =>
    setSelected((list) => {
      const next = [...list];
      [next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ];
      return next;
    });
  return (
    <section aria-label="Choose by Exercise" className="exercise-setup">
      <h2>Choose by Exercise</h2>
      <label htmlFor="setup-search">Search exercises</label>
      <input
        id="setup-search"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() ? (
        <section aria-label="Search results">
          <p role="status">
            {results.length
              ? `${results.length} results${results.length === 20 ? " · refine to see more" : ""}`
              : "No available exercises found."}
          </p>
          <ul className="setup-exercise-options">
            {results.map((e) => (
              <li key={e.id}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => add(e.id)}
                  disabled={busy || selected.length >= 6}
                  aria-label={`Add ${e.name}`}
                >
                  {e.name}
                  <span aria-hidden>＋</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label="Recent exercises">
          <h3>Recent exercises</h3>
          {recent.length ? (
            <ul className="setup-exercise-options">
              {recent.map((e) => (
                <li key={e.id}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => add(e.id)}
                    disabled={busy || selected.length >= 6}
                    aria-label={`Add ${e.name}`}
                  >
                    {e.name}
                    <span aria-hidden>＋</span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="set-source">
              No recent exercises to add. Search the catalog above.
            </p>
          )}
        </section>
      )}
      <section aria-label="Selected exercises">
        <h3>Selected · {selected.length}/6</h3>
        <ol className="setup-selected">
          {selected.map((id, index) => {
            const name = exercises.find((e) => e.id === id)?.name ?? "Exercise";
            return (
              <li key={id}>
                <span>{name}</span>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${name} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || index === selected.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${name} down`}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      setSelected((list) => list.filter((x) => x !== id))
                    }
                    aria-label={`Remove ${name}`}
                  >
                    ×
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <form action={action}>
        <input type="hidden" name="request" value={request} />
        {selected.map((id) => (
          <input key={id} type="hidden" name="exercise" value={id} />
        ))}
        {state.error && <p role="alert">{state.error}</p>}
        <Button type="submit" disabled={busy || !selected.length}>
          {busy ? "Opening workout…" : "Start Workout"}
        </Button>
      </form>
    </section>
  );
}
