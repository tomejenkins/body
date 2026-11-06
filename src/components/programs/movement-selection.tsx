"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExerciseThumbnail } from "@/components/exercises/exercise-thumbnail";
import { Button } from "@/components/ui/button";
import {
  selectProgramExercise,
  searchMovementExercises,
} from "@/features/programs/execution-actions";
import { matchLabels } from "@/features/programs/selection";
import type {
  WorkoutMovement,
  MovementTile,
  MovementFacets,
  MovementSearch,
  SelectionResult,
} from "@/features/programs/execution-types";
const emptySearch: MovementSearch = {
  query: "",
  type: "",
  pattern: "",
  muscle: "",
  equipmentOnly: false,
  page: 1,
};
export function MovementSelection({
  movement,
  disabled,
  facets,
  onSelected,
}: {
  movement: WorkoutMovement;
  disabled: boolean;
  facets: MovementFacets;
  onSelected?: (itemId: string) => void;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [transitioning, startTransition] = useTransition(),
    [message, setMessage] = useState(""),
    [proposed, setProposed] = useState<MovementTile | null>(null),
    [retry, setRetry] = useState<MovementTile | null>(null);
  const request = useRef<{ id: string; exercise: string } | null>(null);
  const [filters, setFilters] = useState(emptySearch),
    [results, setResults] = useState<MovementTile[] | null>(null),
    [total, setTotal] = useState(0),
    [searchBusy, setSearchBusy] = useState(false),
    [searchError, setSearchError] = useState("");
  const searchSeq = useRef(0);
  const carousel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const group = carousel.current;
    if (!group || !movement.currentExerciseId) return;
    const selected = group.querySelector<HTMLButtonElement>(
      `button[data-exercise-id="${movement.currentExerciseId}"]`,
    );
    if (!selected) return;
    const box = group.getBoundingClientRect(),
      tile = selected.getBoundingClientRect();
    if (tile.left < box.left || tile.right > box.right)
      group.scrollTo({
        left: Math.max(
          0,
          group.scrollLeft +
            tile.left -
            box.left -
            (group.clientWidth - tile.width) / 2,
        ),
        behavior: "auto",
      });
  }, [movement.currentExerciseId]);
  async function choose(tile: MovementTile, continueRecorded = false) {
    if (disabled || busy || transitioning || !tile.supported) return;
    setBusy(true);
    setMessage("Saving selection…");
    setRetry(null);
    if (request.current?.exercise !== tile.id)
      request.current = { id: crypto.randomUUID(), exercise: tile.id };
    let result: SelectionResult;
    try {
      result = await selectProgramExercise({
        movementId: movement.id,
        exerciseId: tile.id,
        expectedItemId: movement.currentItemId,
        requestId: request.current.id,
        continueRecorded,
      });
    } catch {
      result = {
        error:
          "Selection could not be confirmed. Retry the same choice when connected.",
      };
    }
    setBusy(false);
    if (result.needsContinuation) {
      setProposed(tile);
      setMessage("");
      return;
    }
    if (result.error) {
      setMessage(result.error);
      if (result.conflict) {
        setProposed(null);
        request.current = null;
        startTransition(() => router.refresh());
      } else setRetry(tile);
      return;
    }
    setProposed(null);
    request.current = null;
    setMessage("Selection saved.");
    startTransition(() => {
      if (result.itemId && onSelected) onSelected(result.itemId);
      else router.refresh();
    });
  }
  async function search(next: MovementSearch) {
    const seq = ++searchSeq.current;
    setSearchBusy(true);
    setSearchError("");
    let result: Awaited<ReturnType<typeof searchMovementExercises>>;
    try {
      result = await searchMovementExercises(movement.id, next);
    } catch {
      result = { error: "Exercise search could not be loaded. Retry." };
    }
    if (seq !== searchSeq.current) return;
    setSearchBusy(false);
    if (result.error) {
      setSearchError(result.error);
      return;
    }
    setResults(result.items ?? []);
    setTotal(result.total ?? 0);
  }
  function tileButton(tile: MovementTile, inSearch = false) {
    const label = tile.level ? matchLabels[tile.level] : "Check fit";
    return (
      <button
        type="button"
        key={tile.id}
        className={`movement-tile ${tile.level === 4 ? "best-match" : ""}`}
        aria-pressed={movement.currentExerciseId === tile.id}
        aria-label={`${tile.name}, ${label}${tile.labels.length ? ", " + tile.labels.join(", ") : ""}`}
        disabled={disabled || busy || transitioning || !tile.supported}
        onClick={() => void choose(tile)}
        data-exercise-id={tile.id}
      >
        <span className="movement-match">{label}</span>
        <ExerciseThumbnail visual={tile.visual} size={32} />
        <span className="movement-exercise-name">{tile.name}</span>
        <span className="movement-tile-context">
          {tile.labels.join(" · ")}
          {!tile.supported
            ? "Time/assistance logging unavailable"
            : tile.equipmentAvailable === false
              ? " · Check equipment"
              : ""}
          {movement.currentExerciseId === tile.id ? " · Selected" : ""}
          {inSearch && tile.level === null ? " · Choose deliberately" : ""}
        </span>
      </button>
    );
  }
  return (
    <section
      className="movement-selection"
      aria-label={`Movement ${movement.position} exercise selection`}
    >
      <div
        ref={carousel}
        className="movement-carousel"
        role="group"
        aria-label={`Exercises for Movement ${movement.position}`}
      >
        {movement.candidates.map((t) => tileButton(t))}
      </div>
      <p className="carousel-hint">Swipe to explore exercises</p>
      {message && (
        <p role="status" className="set-source">
          {message}
        </p>
      )}
      {retry && (
        <Button
          variant="outline"
          type="button"
          disabled={disabled || busy || transitioning}
          onClick={() => void choose(retry, !!proposed)}
        >
          Retry selection
        </Button>
      )}
      {proposed && (
        <div
          className="movement-continuation"
          role="group"
          aria-label="Confirm exercise continuation"
        >
          <p>
            Keep recorded and edited sets under their original exercise and
            continue with {proposed.name}? Untouched suggestions will be
            replaced with the remaining planned sets. If the plan is already
            complete, you can log an extra set.
          </p>
          <Button
            type="button"
            disabled={disabled || busy || transitioning}
            onClick={() => void choose(proposed, true)}
          >
            Keep sets and continue
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || transitioning}
            onClick={() => {
              setProposed(null);
              request.current = null;
              setMessage("");
            }}
          >
            Keep current exercise
          </Button>
        </div>
      )}
      <details
        className="movement-all"
        onToggle={(e) => {
          if (e.currentTarget.open && results === null && !searchBusy)
            void search(filters);
        }}
      >
        <summary>See All Exercises</summary>
        <form
          aria-label={`Search exercises for Movement ${movement.position}`}
          onSubmit={(e) => {
            e.preventDefault();
            const next = { ...filters, page: 1 };
            setFilters(next);
            void search(next);
          }}
        >
          <label>
            Search exercises
            <input
              type="search"
              value={filters.query}
              maxLength={120}
              onChange={(e) =>
                setFilters({ ...filters, query: e.target.value })
              }
            />
          </label>
          <div className="movement-search-filters">
            <label>
              Movement pattern
              <select
                aria-label="Movement pattern filter"
                value={filters.pattern}
                onChange={(e) =>
                  setFilters({ ...filters, pattern: e.target.value })
                }
              >
                <option value="">All patterns</option>
                {facets.patterns.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Muscle
              <select
                aria-label="Muscle filter"
                value={filters.muscle}
                onChange={(e) =>
                  setFilters({ ...filters, muscle: e.target.value })
                }
              >
                <option value="">All muscles</option>
                {facets.muscles.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Exercise type
              <select
                aria-label="Exercise type filter"
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value })
                }
              >
                <option value="">All types</option>
                <option value="compound">Compound</option>
                <option value="isolation">Isolation</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={filters.equipmentOnly}
              onChange={(e) =>
                setFilters({ ...filters, equipmentOnly: e.target.checked })
              }
            />
            Use my equipment preferences
          </label>
          <Button type="submit" disabled={searchBusy || disabled}>
            Search
          </Button>
        </form>
        <p className="set-source">
          Match labels describe contextual compatibility, not exercise quality
          or biomechanical equivalence. Broader choices may change the movement
          or muscle emphasis.
        </p>
        {searchError && <p role="alert">{searchError}</p>}
        {searchBusy && <p role="status">Searching exercises…</p>}
        {results && !searchBusy && (
          <>
            <p role="status">{total} exercises found</p>
            <div className="movement-search-results">
              {results.map((t) => tileButton(t, true))}
            </div>
            <div className="movement-search-pages">
              {filters.page > 1 && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    const next = { ...filters, page: filters.page - 1 };
                    setFilters(next);
                    void search(next);
                  }}
                >
                  Previous exercises
                </Button>
              )}
              {filters.page * 20 < total && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    const next = { ...filters, page: filters.page + 1 };
                    setFilters(next);
                    void search(next);
                  }}
                >
                  More exercises
                </Button>
              )}
            </div>
          </>
        )}
      </details>
    </section>
  );
}
