"use client";
import { useDeferredValue, useState, useEffect } from "react";
import Link from "next/link";
import {
  builderHref,
  exerciseHref,
  builderFilterQuery,
  type BuilderFilters,
} from "@/features/workouts/navigation";
import {
  filterExercises,
  libraryNoneId,
  recommendExercises,
} from "@/features/exercises/recommendations";
import {
  exerciseTypes,
  type Exercise,
  type ExerciseType,
  type Library,
} from "@/features/exercises/types";
import { ExerciseThumbnail } from "./exercise-thumbnail";
import { FavoriteButton } from "./preference-controls";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function ExerciseSelector({
  library,
  onSelect,
  selectedIds = [],
  selecting = false,
  workoutId,
  initialFilters,
}: {
  library: Library;
  onSelect?: (exercise: Exercise) => void;
  selectedIds?: readonly string[];
  selecting?: boolean;
  workoutId?: string;
  initialFilters?: BuilderFilters;
}) {
  const [query, setQuery] = useState(initialFilters?.search ?? "");
  const search = useDeferredValue(query);
  const [pattern, setPattern] = useState(initialFilters?.movement ?? "");
  const [muscle, setMuscle] = useState(initialFilters?.muscle ?? "");
  const [type, setType] = useState<ExerciseType | "">(
    initialFilters?.type ?? "",
  );
  const [equipment, setEquipment] = useState(
    initialFilters?.equipment ?? library.availableEquipmentIds,
  );
  const [equipmentFilter, setEquipmentFilter] = useState(
    initialFilters
      ? initialFilters.equipmentOnly
      : library.availableEquipmentIds.length > 0,
  );
  const [favorites, setFavorites] = useState(
    initialFilters?.favorites ?? false,
  );
  const [custom, setCustom] = useState(initialFilters?.custom ?? false);
  const [limit, setLimit] = useState(24);
  const [refine, setRefine] = useState(initialFilters?.refine ?? false);
  const [recents, setRecents] = useState(initialFilters?.recents ?? false);
  const [suggested, setSuggested] = useState(
    initialFilters?.suggestions ?? false,
  );
  const filters: BuilderFilters = {
    search: query,
    movement: pattern,
    muscle,
    type,
    equipment,
    equipmentOnly: equipmentFilter,
    favorites,
    custom,
    refine,
    recents,
    suggestions: suggested,
  };
  const encoded = builderFilterQuery(filters).toString();
  useEffect(() => {
    if (!workoutId || window.location.pathname !== builderHref(workoutId))
      return;
    const added = new URLSearchParams(window.location.search).get("added");
    const target =
      builderHref(workoutId) +
      `?${encoded}` +
      (added ? `&added=${encodeURIComponent(added)}` : "");
    window.history.replaceState(null, "", target);
  }, [workoutId, encoded]);
  const detailsHref = (id: string) => exerciseHref(id, workoutId, filters);
  const compactAdd = (exercise: Exercise) =>
    onSelect ? (
      <Button
        variant="outline"
        disabled={selecting || selectedIds.includes(exercise.id)}
        onClick={() => onSelect(exercise)}
        aria-label={`${selectedIds.includes(exercise.id) ? "Already Added" : "Add"} ${exercise.name}${selectedIds.includes(exercise.id) ? "" : " to workout"}`}
      >
        {selectedIds.includes(exercise.id) ? "Already Added" : "Add"}
      </Button>
    ) : null;
  const noneId = libraryNoneId(library);
  const recentExercises = library.recentIds.flatMap((id) => {
    const exercise = library.exercises.find((e) => e.id === id);
    return exercise ? [exercise] : [];
  });
  const matches = filterExercises(
    library.exercises,
    {
      query: search,
      patternId: pattern,
      muscleId: muscle,
      exerciseType: type || undefined,
      availableEquipmentIds: equipmentFilter ? equipment : undefined,
      favoritesOnly: favorites,
      customOnly: custom,
    },
    library.preferences,
    noneId,
  ).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const suggestions = recommendExercises(
    library.exercises,
    {
      patternId: pattern || undefined,
      muscleId: muscle || undefined,
      exerciseType: type || undefined,
      availableEquipmentIds: equipmentFilter ? equipment : undefined,
      preferences: library.preferences,
      recentIds: library.recentIds,
      currentWorkoutIds: selectedIds,
    },
    noneId,
  );
  const name = (id: string, items: Library["equipment"]) =>
    items.find((t) => t.id === id)?.name ?? "Unclassified";
  function clear() {
    setQuery("");
    setPattern("");
    setMuscle("");
    setType("");
    setEquipment([]);
    setEquipmentFilter(false);
    setFavorites(false);
    setCustom(false);
    setLimit(24);
  }
  return (
    <>
      <section aria-label="Filter exercises" className="library-filters">
        <div className="library-search">
          <label htmlFor="exercise-search">Find your next movement</label>
          <Input
            id="exercise-search"
            type="search"
            maxLength={workoutId ? 120 : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
            placeholder="Search exercises"
            autoComplete="off"
          />
        </div>
        <details
          className="library-refine"
          open={refine}
          onToggle={(e) => setRefine(e.currentTarget.open)}
        >
          <summary>Refine by movement, muscle or equipment</summary>
          <div className="library-filter-grid">
            <div>
              <label htmlFor="filter-movement">Movement pattern</label>
              <select
                id="filter-movement"
                value={pattern}
                onChange={(e) => {
                  setPattern(e.target.value);
                  setLimit(24);
                }}
              >
                <option value="">All movements</option>
                {library.patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-muscle">Muscle group</label>
              <select
                id="filter-muscle"
                value={muscle}
                onChange={(e) => {
                  setMuscle(e.target.value);
                  setLimit(24);
                }}
              >
                <option value="">All muscles</option>
                {library.muscles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-type">Exercise type</label>
              <select
                id="filter-type"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as ExerciseType | "");
                  setLimit(24);
                }}
              >
                <option value="">All types</option>
                {exerciseTypes.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <details className="equipment-filter">
            <summary>
              Equipment available
              {equipmentFilter
                ? ` · ${equipment.length} selected`
                : " · showing all"}
            </summary>
            <label className="check-label">
              <input
                type="checkbox"
                checked={equipmentFilter}
                onChange={(e) => {
                  setEquipmentFilter(e.target.checked);
                  setLimit(24);
                }}
              />
              Only show exercises I can equip
            </label>
            <p>
              All listed items are required. Select benches and supports too.
              With no items selected, only equipment-free exercises qualify.
            </p>
            <div className="equipment-options">
              {library.equipment
                .filter((e) => e.slug !== "none")
                .map((e) => (
                  <label className="check-label" key={e.id}>
                    <input
                      type="checkbox"
                      checked={equipment.includes(e.id)}
                      onChange={(event) => {
                        setEquipment(
                          event.target.checked
                            ? [...equipment, e.id]
                            : equipment.filter((id) => id !== e.id),
                        );
                        setEquipmentFilter(true);
                        setLimit(24);
                      }}
                    />
                    {e.name}
                  </label>
                ))}
            </div>
          </details>
          <div className="library-toggles">
            <label className="check-label">
              <input
                type="checkbox"
                checked={favorites}
                onChange={(e) => {
                  setFavorites(e.target.checked);
                  setLimit(24);
                }}
              />
              Favorites
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={custom}
                onChange={(e) => {
                  setCustom(e.target.checked);
                  setLimit(24);
                }}
              />
              My custom exercises
            </label>
            <button className="text-button" onClick={clear}>
              Clear filters
            </button>
          </div>
        </details>
      </section>
      {(pattern || muscle) && (
        <details
          className="library-suggestions"
          open={suggested}
          onToggle={(e) => setSuggested(e.currentTarget.open)}
        >
          <summary>Suggested for this movement</summary>
          <p>
            Ranked by primary movement, preference, favorites and real workout
            familiarity. Recommendations always require compatible equipment.
          </p>
          {suggestions.candidates.length > 0 && (
            <ol>
              {suggestions.candidates.map((r) => (
                <li key={r.exercise.id}>
                  <Link href={detailsHref(r.exercise.id)}>
                    {r.exercise.name}
                  </Link>
                  <span>{r.reasons.join(" · ")}</span>
                  {compactAdd(r.exercise)}
                </li>
              ))}
            </ol>
          )}
          {suggestions.limitedReason && (
            <p role="status">{suggestions.limitedReason}</p>
          )}
        </details>
      )}
      {recentExercises.length > 0 ? (
        <details
          className="library-recents"
          open={recents}
          onToggle={(e) => setRecents(e.currentTarget.open)}
        >
          <summary>Recently selected in your workouts</summary>
          <div className="recent-links">
            {recentExercises.slice(0, 8).map((exercise) => (
              <div className="recent-exercise" key={exercise.id}>
                <Link href={detailsHref(exercise.id)}>{exercise.name}</Link>
                {compactAdd(exercise)}
              </div>
            ))}
          </div>
        </details>
      ) : (
        <p className="library-note">
          Your recent selections will appear after you log workouts. Explore the
          library or save a favorite to start.
        </p>
      )}
      <p role="status" aria-live="polite" className="library-count">
        {matches.length} {matches.length === 1 ? "exercise" : "exercises"}
        {query !== search ? " · Searching…" : ""}
      </p>
      {matches.length === 0 ? (
        <section className="empty-state">
          <h2>No matching exercises</h2>
          <p>
            Try fewer filters or add your own exercise. We won’t fill the list
            with incompatible movements.
          </p>
          <Button variant="outline" onClick={clear}>
            Clear filters
          </Button>
        </section>
      ) : (
        <div className="exercise-grid" aria-label="Exercise results">
          {matches.slice(0, limit).map((exercise) => (
            <article className="exercise-card" key={exercise.id}>
              <div className="exercise-card-heading">
                <ExerciseThumbnail
                  visual={{
                    slug: exercise.slug,
                    ownerId: exercise.ownerId,
                    patternSlug: library.patterns.find(
                      (p) => p.id === exercise.primaryPatternId,
                    )?.slug,
                  }}
                />
                <h2>
                  <Link href={detailsHref(exercise.id)}>{exercise.name}</Link>
                </h2>
                <FavoriteButton
                  exercise={exercise}
                  favorite={library.preferences.some(
                    (p) => p.exerciseId === exercise.id && p.isFavorite,
                  )}
                />
              </div>
              <p className="exercise-pattern">
                {exercise.primaryPatternId
                  ? name(exercise.primaryPatternId, library.patterns)
                  : "Primary movement not classified"}
              </p>
              <p>
                {exercise.equipmentIds
                  .map((id) => name(id, library.equipment))
                  .join(" · ") || "Equipment not classified"}
              </p>
              <p className="exercise-muscles">
                {exercise.primaryMuscleIds
                  .map((id) => name(id, library.muscles))
                  .join(" · ")}
              </p>
              <div className="exercise-badges">
                <span>{exercise.exerciseType}</span>
                {exercise.ownerId && <span>Private custom</span>}
              </div>
              {onSelect && (
                <Button
                  variant="outline"
                  disabled={selecting || selectedIds.includes(exercise.id)}
                  onClick={() => onSelect(exercise)}
                >
                  {selectedIds.includes(exercise.id)
                    ? "Already selected"
                    : "Select exercise"}
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      {matches.length > limit && (
        <Button
          className="load-more"
          variant="outline"
          onClick={() => setLimit(limit + 24)}
        >
          Show more exercises
        </Button>
      )}
    </>
  );
}
