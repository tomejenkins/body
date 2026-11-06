"use client";
import { SuggestedMovementControls } from "@/components/workouts/suggested-movement-controls";
import { ExerciseNavigation } from "@/components/workouts/exercise-navigation";
import { WorkoutDuration } from "@/components/workouts/workout-duration";
import { workoutProgress } from "@/features/workouts/progress";
import { MovementSelection } from "@/components/programs/movement-selection";
import {
  rpeValues,
  rirValues,
  effortSummary,
  type EffortScale,
} from "@/features/sets/effort";
import { LocalTime } from "@/components/history/local-time";
import { friendlyWorkoutName } from "@/features/history/model";
import Link from "next/link";
import { WorkoutCheckIn } from "@/components/continuity/workout-check-in";
import { readWorkoutContinuity } from "@/features/continuity/actions";
import {
  closureExplanation,
  type Continuity,
} from "@/features/continuity/model";
import { exerciseHref, loggerHref } from "@/features/workouts/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Workout, WorkoutItem } from "@/features/workouts/types";
import { isUuid } from "@/features/exercises/validation";
import { mutateSet, readSetRows } from "@/features/sets/actions";
import {
  draftFor,
  newSetDraft,
  compareSets,
  valuesFor,
  summarizeSets,
  setTypes,
  type LoggedSet,
  type SetDraft,
  type SetCommand,
  type WeightUnit,
} from "@/features/sets/model";
import { ExerciseThumbnail } from "@/components/exercises/exercise-thumbnail";
import {
  CloseWorkout,
  ItemControls,
} from "@/components/workouts/workout-controls";
import { Button } from "@/components/ui/button";
type LoggerRow = {
  item: WorkoutItem | null;
  movement:
    import("@/features/programs/execution-types").WorkoutMovement | null;
  showSelection: boolean;
};
type Entry = {
  exerciseName?: string;
  exerciseId?: string;
  row: LoggedSet;
  draft: SetDraft;
  seq: number;
  dirty: boolean;
  pending: number;
  error?: string;
  conflict?: LoggedSet;
  retry?: SetCommand;
  localOnly?: boolean;
  retrySeq?: number;
  deleting?: boolean;
};
function PrescribedTarget({ row }: { row: LoggedSet }) {
  return (
    <p className="set-source">
      Target{" "}
      {row.prescribed_reps_min === row.prescribed_reps_max
        ? row.prescribed_reps_min
        : `${row.prescribed_reps_min}–${row.prescribed_reps_max}`}{" "}
      reps
      {row.prescribed_effort_scale &&
        ` · Target ${row.prescribed_effort_scale.toUpperCase()} ${row.prescribed_effort_value}`}
      {row.prescribed_to_failure ? " · Optional To Failure intent" : ""}
    </p>
  );
}
export function WorkoutLogger({
  workout,
  focusedItemId,
}: {
  workout: Workout;
  focusedItemId?: string;
}) {
  const focusedItem = workout.items.find((i) => i.id === focusedItemId);
  const focusedMovement = workout.movements?.find(
    (m) => m.id === focusedItem?.programMovementId,
  );
  const home = !focusedItem;
  const [expanded, setExpanded] = useState<string | null>(null);
  const previousScreen = useRef(focusedItemId);
  useLayoutEffect(() => {
    if (previousScreen.current === focusedItemId) return;
    previousScreen.current = focusedItemId;
    // Never move the page after an initial SSR click has already begun.
    // Screen-change focus runs before paint, while the queue remains mounted.
    document.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [focusedItemId]);
  const [unit, setUnit] = useState(workout.weightUnit);
  const unitRef = useRef(unit);
  unitRef.current = unit;
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      workout.items.flatMap((i) =>
        i.sets.map((row) => [
          row.id,
          {
            row,
            draft: draftFor(row, unit),
            seq: 0,
            dirty: false,
            pending: 0,
            exerciseName: i.name,
            exerciseId: i.exerciseId,
          },
        ]),
      ),
    ),
  );
  const ref = useRef(entries);
  ref.current = entries;
  function update(fn: (old: Record<string, Entry>) => Record<string, Entry>) {
    const next = fn(ref.current);
    ref.current = next;
    setEntries(next);
  }
  const [recovery, setRecovery] = useState("");
  const [leaving, setLeaving] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [continuity, setContinuity] = useState<Continuity | null>(
    workout.continuity ?? null,
  );
  const active = workout.status === "in_progress";
  const [checkInBusy, setCheckInBusy] = useState(false);
  const canEdit =
    active &&
    !checkInBusy &&
    (!continuity || continuity.status === "in_progress");
  const router = useRouter();
  const chain = useRef(Promise.resolve());
  const pending = Object.values(entries).some((e) => e.pending > 0);
  const dirty =
    active &&
    Object.values(entries).some(
      (e) => e.dirty || e.pending > 0 || e.error || e.localOnly,
    );
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const allowLeave = useRef(false);
  const itemsRef = useRef(workout.items);
  itemsRef.current = workout.items;
  const key = `body-set-drafts:${workout.userId}:${workout.id}`;
  useEffect(() => {
    update((old) => {
      const next = { ...old };
      for (const item of workout.items)
        for (const row of item.sets) {
          const previous = next[row.id];
          if (!previous)
            next[row.id] = {
              row,
              exerciseName: item.name,
              exerciseId: item.exerciseId,
              draft: draftFor(row, unitRef.current),
              seq: 0,
              dirty: false,
              pending: 0,
            };
          else if (
            row.revision > previous.row.revision &&
            !previous.dirty &&
            !previous.pending &&
            !previous.error
          )
            next[row.id] = {
              ...previous,
              row,
              draft: draftFor(row, unitRef.current),
            };
        }
      return next;
    });
  }, [workout]);
  useEffect(() => {
    if (!active) return;
    try {
      const saved = sessionStorage.getItem(key);
      if (!saved || saved.length > 1000000) return;
      const cache = JSON.parse(saved) as {
        unit: WeightUnit;
        entries: Record<string, Entry>;
      };
      if (!["kg", "lb"].includes(cache.unit) || !cache.entries) return;
      const parsed = cache.entries;
      const restoredUnit = cache.unit;
      setUnit(restoredUnit);
      unitRef.current = restoredUnit;
      update((old) => {
        const next = Object.fromEntries(
          Object.entries(old).map(([id, e]) => [
            id,
            { ...e, draft: draftFor(e.row, restoredUnit) },
          ]),
        );
        for (const [id, entry] of Object.entries(parsed)) {
          if (
            !isUuid(id) ||
            !isUuid(entry.row?.workout_exercise_id) ||
            (!itemsRef.current.some(
              (i) => i.id === entry.row?.workout_exercise_id,
            ) &&
              !(
                typeof entry.exerciseName === "string" &&
                entry.exerciseName.length <= 200 &&
                typeof entry.exerciseId === "string" &&
                isUuid(entry.exerciseId)
              )) ||
            !entry.draft ||
            typeof entry.draft.weight !== "string" ||
            typeof entry.draft.reps !== "string"
          )
            continue;
          const current = next[id];
          if (current || entry.localOnly || entry.exerciseName)
            next[id] = {
              ...entry,
              row: entry.row,
              pending: 0,
              dirty: true,
              error: "Recovered unsaved draft. Review and retry.",
              conflict:
                current && current.row.revision !== entry.row.revision
                  ? current.row
                  : undefined,
            };
        }
        return next;
      });
      setRecovery(
        "Unsaved drafts recovered for this workout. They are not confirmed saved.",
      );
    } catch {
      setRecovery(
        "Draft recovery is unavailable. Keep this page open until edits are saved.",
      );
    }
  }, [key, active]);
  useEffect(() => {
    if (!active) return;
    try {
      const drafts = Object.fromEntries(
        Object.entries(entries).filter(
          ([, e]) => e.dirty || e.pending || e.error || e.localOnly,
        ),
      );
      if (Object.keys(drafts).length)
        sessionStorage.setItem(key, JSON.stringify({ unit, entries: drafts }));
      else sessionStorage.removeItem(key);
    } catch {
      /* Failed writes still remain visible in component state and beforeunload warns. */
    }
  }, [entries, key, active, unit]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current && !allowLeave.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      if (!dirtyRef.current || allowLeave.current || event.defaultPrevented)
        return;
      const link = (event.target as Element).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !link ||
        link.target === "_blank" ||
        link.origin !== location.origin ||
        (link.pathname === location.pathname &&
          (link.search === location.search ||
            link.pathname === `/workout/${workout.id}`))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeaving(link.pathname + link.search + link.hash);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [workout.id]);
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState === "hidden" || dirtyRef.current) return;
      const result = await readWorkoutContinuity(workout.id);
      if (result.data) {
        setContinuity(result.data);
        if (result.data.status !== "in_progress" && !dirtyRef.current)
          router.refresh();
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [workout.id, router]);
  function cacheDraftsNow() {
    try {
      const drafts = Object.fromEntries(
        Object.entries(ref.current).filter(
          ([, e]) => e.dirty || e.pending || e.error || e.localOnly,
        ),
      );
      sessionStorage.setItem(
        key,
        JSON.stringify({ unit: unitRef.current, entries: drafts }),
      );
    } catch {
      setRecovery(
        "Draft recovery unavailable. Keep this page open until edits are saved.",
      );
    }
  }
  function change(id: string, patch: Partial<SetDraft>) {
    update((old) => ({
      ...old,
      [id]: {
        ...old[id],
        draft: { ...old[id].draft, ...patch },
        dirty: true,
        seq: old[id].seq + 1,
        error: undefined,
      },
    }));
    cacheDraftsNow();
    setAck(false);
  }
  function enqueue(
    id: string,
    operation: SetCommand["operation"] = "save",
    direction?: -1 | 1,
    retry?: SetCommand,
  ) {
    const entry = ref.current[id];
    if (!entry || entry.conflict) return;
    let values;
    try {
      values =
        operation === "move" || operation === "remove"
          ? {
              reps: entry.row.actual_reps,
              weight:
                entry.row.actual_weight_kg === null
                  ? null
                  : String(entry.row.actual_weight_kg),
              type: entry.row.set_type,
              mode: entry.row.load_mode,
              completed: entry.row.status === "completed",
            }
          : valuesFor(entry.draft, unitRef.current, entry.row);
    } catch (error) {
      update((old) => ({
        ...old,
        [id]: {
          ...old[id],
          error: error instanceof Error ? error.message : "Check values.",
          dirty: true,
        },
      }));
      return;
    }
    const snapshot = entry.seq;
    const mutation = retry?.mutation ?? crypto.randomUUID();
    update((old) => ({
      ...old,
      [id]: {
        ...old[id],
        pending: old[id].pending + 1,
        deleting: operation === "remove",
        error: undefined,
      },
    }));
    cacheDraftsNow();
    chain.current = chain.current
      .then(async () => {
        const current = ref.current[id];
        if (!current) return;
        const command: SetCommand = retry ?? {
          itemId: entry.row.workout_exercise_id,
          id,
          operation: entry.localOnly ? "add" : operation,
          revision: current.row.revision,
          mutation,
          ...values,
          direction,
        };
        let result;
        try {
          result = await mutateSet(command);
        } catch {
          result = {
            error: "Save could not be confirmed. Retry when connected.",
          };
        }
        update((old) => {
          const next = { ...old };
          const latest = next[id];
          if (!latest) return old;
          if (result.error) {
            void readWorkoutContinuity(workout.id).then((value) => {
              if (value.data) setContinuity(value.data);
            });
            next[id] = {
              ...latest,
              pending: Math.max(0, latest.pending - 1),
              dirty: true,
              error: result.error,
              retry: command,
              retrySeq: snapshot,
              deleting: false,
              conflict: result.conflict
                ? result.rows?.find((r) => r.id === id)
                : undefined,
            };
            return next;
          }
          setContinuity(null);
          for (const row of result.rows ?? []) {
            const existing = next[row.id];
            if (!existing) {
              next[row.id] = {
                row,
                exerciseName: itemsRef.current.find(
                  (i) => i.id === row.workout_exercise_id,
                )?.name,
                exerciseId: itemsRef.current.find(
                  (i) => i.id === row.workout_exercise_id,
                )?.exerciseId,
                draft: draftFor(row, unitRef.current),
                seq: 0,
                dirty: false,
                pending: 0,
              };
              continue;
            }
            const own = row.id === id;
            if (
              own &&
              command.operation === "add" &&
              row.last_mutation_id !== command.mutation
            ) {
              next[row.id] = {
                ...existing,
                row,
                localOnly: false,
                pending: 0,
                dirty: true,
                conflict: row,
                error:
                  "Creation confirmed with different saved values. Review before saving your draft.",
              };
              continue;
            }
            if (
              !own &&
              existing.dirty &&
              row.revision !== existing.row.revision
            ) {
              next[row.id] = {
                ...existing,
                conflict: row,
                error:
                  "Changed elsewhere. Review saved values before retrying.",
              };
              continue;
            }
            const unchanged = own
              ? existing.seq === snapshot
              : !existing.dirty && !existing.pending && !existing.error;
            next[row.id] = {
              ...existing,
              row,
              draft: unchanged
                ? draftFor(row, unitRef.current, existing.draft.effortScale)
                : existing.draft,
              dirty: unchanged ? false : existing.dirty,
              pending: own
                ? Math.max(0, existing.pending - 1)
                : existing.pending,
              error: own ? undefined : existing.error,
              retry: own ? undefined : existing.retry,
              localOnly: own ? false : existing.localOnly,
              deleting: false,
            };
          }
          return next;
        });
      })
      .catch(() =>
        update((old) => ({
          ...old,
          [id]: {
            ...old[id],
            pending: 0,
            error: "Save was interrupted. Retry.",
            dirty: true,
          },
        })),
      );
  }
  function add(itemId: string, bodyweight: boolean) {
    if (
      Object.values(ref.current).some(
        (e) => e.row.workout_exercise_id === itemId && e.localOnly,
      )
    )
      return;
    const previous = Object.values(ref.current)
      .filter((e) => e.row.workout_exercise_id === itemId && !e.row.deleted_at)
      .sort((a, b) => compareSets(a.row, b.row))
      .at(-1);
    let values;
    const draft = newSetDraft(previous?.draft, bodyweight);
    try {
      values = valuesFor(draft, unitRef.current, previous?.row ?? null);
    } catch (error) {
      setRecovery(
        error instanceof Error
          ? error.message
          : "Check the preceding set before adding.",
      );
      return;
    }
    const id = crypto.randomUUID();
    const row: LoggedSet = {
      id,
      workout_exercise_id: itemId,
      position: previous ? previous.row.position + 1 : 1,
      set_type: values.type,
      load_mode: values.mode,
      status: "pending",
      actual_reps: values.reps,
      actual_weight_kg: values.weight === null ? null : Number(values.weight),
      completed_at: null,
      revision: 0,
      last_mutation_id: null,
      deleted_at: null,
      entered_weight:
        values.enteredWeight == null ? null : Number(values.enteredWeight),
      entered_unit: values.enteredUnit,
    };
    update((old) => ({
      ...old,
      [id]: {
        row,
        draft,
        seq: 0,
        dirty: true,
        pending: 0,
        localOnly: true,
        exerciseName: itemsRef.current.find((i) => i.id === itemId)?.name,
        exerciseId: itemsRef.current.find((i) => i.id === itemId)?.exerciseId,
      },
    }));
    enqueue(id, "add");
    setAck(false);
  }
  const orphanedDrafts = Object.entries(entries).filter(
    ([, e]) =>
      (e.dirty || e.pending || e.error || e.localOnly) &&
      !workout.items.some((i) => i.id === e.row.workout_exercise_id),
  );
  const itemSets = workout.items.map((item) => ({
    ...item,
    sets: Object.values(entries)
      .filter((e) => e.row.workout_exercise_id === item.id && !e.row.deleted_at)
      .map((e) => e.row),
  }));
  const summary = summarizeSets(itemSets);
  const missing =
    itemSets.filter(
      (i) => !i.programMovementId && i.sets.length < (i.prescribedSets ?? 1),
    ).length +
    (workout.movements?.filter(
      (m) =>
        itemSets
          .filter((i) => i.programMovementId === m.id)
          .reduce(
            (n, i) => n + i.sets.filter((s) => s.set_type !== "warm_up").length,
            0,
          ) < m.workingSets,
    ).length ?? 0);
  const programRows = workout.movements?.length
    ? workout.movements.flatMap<LoggerRow>((m) => {
        const items = workout.items.filter((i) => i.programMovementId === m.id);
        return items.length
          ? items.map((item) => ({
              item,
              movement: m,
              showSelection: item.id === m.currentItemId,
            }))
          : [{ item: null, movement: m, showSelection: true }];
      })
    : [];
  const displayedRows: LoggerRow[] = programRows.length
    ? [
        ...programRows,
        ...workout.items
          .filter((i) => !i.programMovementId)
          .map((item) => ({ item, movement: null, showSelection: false })),
      ]
    : workout.items.map((item) => ({
        item,
        movement: null,
        showSelection: false,
      }));
  const progress = workoutProgress(workout, itemSets);
  const focusedProgress = progress.find(
    (p) => p.id === (focusedMovement?.id ?? focusedItem?.id),
  );
  const focusedRows = displayedRows.filter(
    ({ item }) => item?.id === focusedItem?.id,
  );
  const incomplete = summary.pending > 0 || missing > 0;
  return (
    <div
      className={`workout-execution ${home ? "workout-home-screen" : "workout-exercise-screen"}`}
      onSubmitCapture={(event) => {
        if (dirty) {
          event.preventDefault();
          setRecovery(
            "Save or explicitly discard unsaved edits before changing or closing this workout.",
          );
        }
      }}
    >
      <div className="page-heading">
        {home ? (
          <Link href={workout.isProgram ? "/programs" : "/workout"}>
            {workout.isProgram ? "← Programs" : "← Workout"}
          </Link>
        ) : (
          <Link href={loggerHref(workout.id)}>← Back to Workout Home</Link>
        )}

        <h1 tabIndex={-1}>
          {home
            ? friendlyWorkoutName(workout.name)
            : (focusedMovement?.label ?? focusedItem.name)}
        </h1>
        <p className="eyebrow">
          {home
            ? "Workout Home"
            : focusedMovement
              ? `Movement ${focusedMovement.position}`
              : "Exercise Logger"}
        </p>
        {home && (
          <WorkoutDuration
            startedAt={workout.startedAt}
            serverNow={workout.continuity?.server_now}
            inactive={
              !!workout.continuity?.idle_intervals.length ||
              workout.continuity?.state === "check_in"
            }
          />
        )}

        {workout.finishedAt && (
          <p>
            Closed <LocalTime value={workout.finishedAt} />
          </p>
        )}
      </div>
      {continuity?.state === "check_in" && !dirty && !pending && (
        <WorkoutCheckIn
          workout={continuity}
          onBusy={setCheckInBusy}
          onState={setContinuity}
        />
      )}
      {continuity && continuity.status !== "in_progress" && (
        <section className="draft-warning" role="status">
          <p>
            {closureExplanation(continuity.closure_reason) ||
              "This workout is closed. Your draft inputs remain here for review."}
          </p>
          <Link href={`/history/${workout.id}`}>Review saved workout</Link>
        </section>
      )}
      <p className="logging-summary sr-only" role="status">
        {workout.movements?.length || workout.items.length}{" "}
        {workout.movements?.length ? "movements" : "exercises"} ·{" "}
        {summary.completed} completed sets · {summary.pending} pending sets
      </p>
      {orphanedDrafts.length > 0 && (
        <section
          className="draft-warning"
          aria-label="Drafts for replaced selections"
        >
          <h2>Unapplied drafts for replaced selections</h2>
          <p>
            Another client removed or replaced the previous selection. These
            device inputs are not recorded performance and will not be applied
            to a different exercise. Review or copy them before clearing.
          </p>
          <ul>
            {orphanedDrafts.map(([id, e]) => (
              <li key={id}>
                {e.exerciseName ?? "Previous selection"}:{" "}
                {e.draft.weight || "blank"} {unit}, {e.draft.reps || "blank"}{" "}
                reps{" "}
                {effortSummary({
                  effort_scale: e.draft.effortScale,
                  effort_value: e.draft.effortValue
                    ? Number(e.draft.effortValue)
                    : null,
                  performed_to_failure: e.draft.toFailure,
                })}
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!e.pending}
                  onClick={() =>
                    update((old) => {
                      const next = { ...old };
                      delete next[id];
                      return next;
                    })
                  }
                >
                  Clear this unapplied draft
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {recovery && (
        <p className="auth-error" role="status">
          {recovery}
        </p>
      )}
      {leaving && (
        <div className="draft-warning" role="alert">
          <p>
            Unsaved changes are still here. Save/retry them before leaving, or
            explicitly discard them.
          </p>
          <Button variant="outline" onClick={() => setLeaving(null)}>
            Stay here
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              sessionStorage.removeItem(key);
              allowLeave.current = true;
              router.push(leaving);
            }}
          >
            Discard drafts and leave
          </Button>
        </div>
      )}
      {home && (
        <div className="workout-toolbar">
          {active && (
            <Button asChild>
              <Link href={`/workout/${workout.id}/select`}>Add exercises</Link>
            </Button>
          )}
          {!workout.isProgram && workout.movementOptions && (
            <SuggestedMovementControls
              key={`add-${workout.movements?.map((m) => m.id).join(":") ?? "blank"}`}
              session={workout.id}
              options={workout.movementOptions}
              disabled={!canEdit || dirty || pending}
            />
          )}
        </div>
      )}
      {!workout.items.length && !workout.movements?.length && (
        <section className="empty-state">
          <h2>
            {active ? "No exercises selected yet." : "No exercises selected."}
          </h2>
          <p>Choose a movement from your library to get started.</p>
        </section>
      )}
      {home ? (
        <section
          aria-label="Workout Home"
          className="workout-home workout-screen"
        >
          <p className="workout-progress-summary">
            {progress.filter((p) => p.progress.status === "Complete").length} of{" "}
            {progress.length}{" "}
            {workout.movements?.length ? "movements" : "exercises"} complete
          </p>
          <ol className="workout-items" aria-label="Workout movements">
            {progress.map((group, index) => {
              const movement = group.movement;
              const current =
                group.items.find((i) => i.id === movement?.currentItemId) ??
                group.items.at(-1);
              const label = movement
                ? `Movement ${movement.position} · ${movement.label}`
                : (current?.name ?? `Exercise ${index + 1}`);
              return (
                <li
                  key={group.id}
                  className="workout-item workout-movement-card"
                  data-movement-id={movement?.id}
                >
                  <div className="workout-home-heading">
                    <h2>
                      {current && (
                        <ExerciseThumbnail visual={current.visual} size={32} />
                      )}
                      {movement ? (
                        <button
                          className="movement-row-toggle"
                          type="button"
                          aria-label={
                            expanded === group.id
                              ? "Hide exercises"
                              : current
                                ? "Choose or change exercise"
                                : "Choose exercise"
                          }
                          aria-expanded={expanded === group.id}
                          aria-controls={`selection-${group.id}`}
                          onClick={() =>
                            setExpanded(expanded === group.id ? null : group.id)
                          }
                        >
                          {label}
                          <span aria-hidden="true">
                            {expanded === group.id ? "−" : "+"}
                          </span>
                        </button>
                      ) : (
                        label
                      )}
                    </h2>
                    <span
                      className="movement-status"
                      data-status={group.progress.status}
                    >
                      <span aria-hidden="true">
                        {group.progress.status === "Complete"
                          ? "✓"
                          : group.progress.status === "In Progress"
                            ? "◐"
                            : "○"}
                      </span>{" "}
                      {group.progress.status}
                    </span>
                  </div>
                  {movement && current && (
                    <p>
                      <Link
                        aria-label="Open exercise logger"
                        href={loggerHref(workout.id, current.id)}
                      >
                        {current.name} <span aria-hidden="true">→</span>
                      </Link>
                    </p>
                  )}
                  <p className="set-source">
                    {group.progress.completed}
                    {group.progress.required
                      ? ` of ${group.progress.required}`
                      : ""}{" "}
                    completed working sets
                  </p>
                  {movement?.suggested && (
                    <SuggestedMovementControls
                      session={workout.id}
                      movement={movement.id}
                      options={workout.movementOptions ?? []}
                      disabled={!canEdit || dirty || pending}
                    />
                  )}
                  {movement ? (
                    <>
                      {expanded === group.id && (
                        <div id={`selection-${group.id}`}>
                          <MovementSelection
                            movement={movement}
                            facets={
                              workout.movementFacets ?? {
                                patterns: [],
                                muscles: [],
                              }
                            }
                            disabled={!canEdit || dirty || pending}
                            onSelected={(itemId) =>
                              router.push(loggerHref(workout.id, itemId))
                            }
                          />
                        </div>
                      )}
                      {group.items
                        .filter((i) => i.id !== current?.id)
                        .map((i) => (
                          <p className="set-source" key={i.id}>
                            <Link href={loggerHref(workout.id, i.id)}>
                              Earlier exercise · {i.name}
                            </Link>
                          </p>
                        ))}
                    </>
                  ) : (
                    current && (
                      <>
                        <Button asChild>
                          <Link href={loggerHref(workout.id, current.id)}>
                            Log {current.name}
                          </Link>
                        </Button>
                        <ItemControls
                          sessionId={workout.id}
                          item={{
                            ...current,
                            canRemove: current.canRemove && !dirty && !pending,
                          }}
                          first={index === 0}
                          last={index === progress.length - 1}
                        />
                      </>
                    )
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <section className="workout-screen" aria-label="Exercise Logger">
          <p className="exercise-progress-summary" role="status">
            {focusedProgress?.progress.status} ·{" "}
            {focusedProgress?.progress.completed}
            {focusedProgress?.progress.required
              ? ` of ${focusedProgress.progress.required}`
              : ""}{" "}
            working sets complete
          </p>
          {focusedMovement && (
            <MovementSelection
              movement={focusedMovement}
              facets={workout.movementFacets ?? { patterns: [], muscles: [] }}
              disabled={!canEdit || dirty || pending}
              onSelected={(itemId) =>
                router.push(loggerHref(workout.id, itemId))
              }
            />
          )}
          {!focusedMovement && (
            <ExerciseNavigation
              workoutId={workout.id}
              items={workout.items.filter((i) => !i.programMovementId)}
              selectedId={focusedItem.id}
            />
          )}
          {focusedMovement && (
            <h2 className="selected-exercise-title">
              <Link
                href={exerciseHref(
                  focusedItem.exerciseId,
                  workout.id,
                  undefined,
                  false,
                  focusedItem.id,
                )}
              >
                {focusedItem.name}
              </Link>
            </h2>
          )}
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="sr-only">Workout sets</legend>
            <ol className="workout-items" aria-label="Selected exercises">
              {focusedRows.map(({ item, movement, showSelection }, index) => {
                if (!item) return null;
                const visible = Object.values(entries)
                  .filter(
                    (e) =>
                      e.row.workout_exercise_id === item.id &&
                      !e.row.deleted_at,
                  )
                  .sort((a, b) => compareSets(a.row, b.row));
                const unsupported =
                  item.loggingKind === "duration" ||
                  item.loggingKind === "assisted";
                const uniformTarget =
                  !!item.programMovementId &&
                  visible.length > 0 &&
                  visible[0].row.prescribed_reps_min != null &&
                  visible.every((e) =>
                    [
                      "prescribed_reps_min",
                      "prescribed_reps_max",
                      "prescribed_effort_scale",
                      "prescribed_effort_value",
                      "prescribed_to_failure",
                    ].every(
                      (k) =>
                        e.row[k as keyof LoggedSet] ===
                        visible[0].row[k as keyof LoggedSet],
                    ),
                  );
                const showLoad =
                  !item.bodyweightEligible ||
                  visible.some((e) => e.draft.mode === "external");
                return (
                  <li
                    key={item.id}
                    className="workout-item"
                    data-exercise-id={item.exerciseId}
                    data-movement-id={movement?.id}
                  >
                    {movement && (
                      <>
                        <p className="eyebrow">
                          Movement {movement.position} · {movement.label}
                          {!showSelection ? " · Earlier exercise" : ""}
                        </p>
                      </>
                    )}
                    <div className="workout-item-heading">
                      <ExerciseThumbnail visual={item.visual} />
                      <span className="workout-position">
                        {movement?.position ?? index + 1}
                      </span>
                      <h2>
                        <Link
                          href={exerciseHref(
                            item.exerciseId,
                            active ? workout.id : undefined,
                            undefined,
                            false,
                            item.id,
                          )}
                        >
                          {item.name}
                        </Link>
                      </h2>
                      <span className="set-context">{item.exerciseType}</span>
                    </div>
                    {unsupported && (
                      <p role="note">
                        {item.loggingKind === "duration"
                          ? "This movement is tracked by time or distance. Duration tracking is not available yet; no repetitions will be recorded."
                          : "Assistance reduces resistance. Assistance tracking is not available yet; it will never be recorded as added weight."}
                      </p>
                    )}
                    {item.bodyweightEligible && !unsupported && (
                      <p className="set-source">
                        Bodyweight · Add resistance only when you use it.
                      </p>
                    )}
                    {uniformTarget && (
                      <div className="common-prescription">
                        <span>
                          {visible.length}{" "}
                          {movement?.suggested ? "suggested" : "planned"} sets
                        </span>
                        <PrescribedTarget row={visible[0].row} />
                      </div>
                    )}
                    <div
                      className={`set-grid set-head ${showLoad ? "" : "reps-first"}`}
                      aria-hidden="true"
                    >
                      <span>Set</span>
                      {showLoad && (
                        <span>
                          {item.bodyweightEligible ? "Added " : ""}
                          {unit === "lb" ? "LBS" : "KG"}
                        </span>
                      )}
                      <span>Reps</span>
                      <span>Done</span>
                    </div>
                    {visible.map((entry, i) => (
                      <div
                        key={entry.row.id}
                        className={`logged-set ${entry.draft.completed ? "is-complete" : ""}`}
                        data-set-id={entry.row.id}
                      >
                        {item.programMovementId &&
                          !uniformTarget &&
                          entry.row.prescribed_reps_min != null && (
                            <PrescribedTarget row={entry.row} />
                          )}
                        <div
                          className={`set-grid ${showLoad ? "" : "reps-first"}`}
                        >
                          <span className="set-number">
                            {entry.draft.type === "warm_up" ? "W" : i + 1}
                          </span>
                          {entry.draft.mode === "bodyweight" ? (
                            showLoad ? (
                              <span className="bodyweight-marker">
                                Bodyweight
                              </span>
                            ) : null
                          ) : (
                            <input
                              aria-label={`${item.name} set ${i + 1} weight in ${unit === "lb" ? "pounds" : "kilograms"}`}
                              inputMode="decimal"
                              autoComplete="off"
                              value={entry.draft.weight}
                              placeholder="—"
                              disabled={
                                !canEdit || unsupported || entry.deleting
                              }
                              onChange={(e) =>
                                change(entry.row.id, {
                                  weight: e.target.value,
                                  weightDirty: true,
                                })
                              }
                              onBlur={() => {
                                if (ref.current[entry.row.id].dirty)
                                  enqueue(entry.row.id);
                              }}
                            />
                          )}
                          <input
                            aria-label={`${item.name} set ${i + 1} reps`}
                            inputMode="numeric"
                            autoComplete="off"
                            value={entry.draft.reps}
                            placeholder="—"
                            disabled={!canEdit || unsupported || entry.deleting}
                            onChange={(e) =>
                              change(entry.row.id, { reps: e.target.value })
                            }
                            onBlur={() => {
                              if (ref.current[entry.row.id].dirty)
                                enqueue(entry.row.id);
                            }}
                          />
                          <label className="set-completion-control">
                            <input
                              aria-label={`${item.name} set ${i + 1} complete`}
                              type="checkbox"
                              checked={entry.draft.completed}
                              disabled={
                                !canEdit || unsupported || !!entry.pending
                              }
                              onPointerDown={(e) => e.preventDefault()}
                              onChange={(e) => {
                                change(entry.row.id, {
                                  completed: e.target.checked,
                                });
                                enqueue(entry.row.id);
                              }}
                            />
                          </label>
                        </div>
                        <div className="set-save-state" role="status">
                          {entry.pending
                            ? "Saving…"
                            : entry.error
                              ? "Not saved"
                              : entry.dirty
                                ? "Unsaved changes"
                                : "Saved"}
                          {entry.row.inputs_confirmed === false &&
                          entry.row.suggested_from_date
                            ? " · suggested"
                            : ""}
                          {entry.draft.mode === "bodyweight"
                            ? " · Bodyweight"
                            : ""}
                        </div>
                        {entry.error && (
                          <div className="set-error" role="alert">
                            <p>{entry.error}</p>
                            {entry.conflict ? (
                              <>
                                <p>
                                  Saved elsewhere:{" "}
                                  {displayRemote(entry.conflict, unit)}
                                </p>
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    update((old) => ({
                                      ...old,
                                      [entry.row.id]: {
                                        ...old[entry.row.id],
                                        row: entry.conflict ?? entry.row,
                                        draft: draftFor(
                                          entry.conflict ?? entry.row,
                                          unit,
                                        ),
                                        dirty: false,
                                        error: undefined,
                                        conflict: undefined,
                                        retry: undefined,
                                      },
                                    }))
                                  }
                                >
                                  Use saved version
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    update((old) => ({
                                      ...old,
                                      [entry.row.id]: {
                                        ...old[entry.row.id],
                                        row: entry.conflict ?? entry.row,
                                        conflict: undefined,
                                        retry: undefined,
                                        error: undefined,
                                      },
                                    }));
                                    enqueue(entry.row.id);
                                  }}
                                >
                                  Retry my values
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                onClick={() =>
                                  enqueue(
                                    entry.row.id,
                                    entry.localOnly ? "add" : "save",
                                    undefined,
                                    entry.retry && entry.seq === entry.retrySeq
                                      ? entry.retry
                                      : undefined,
                                  )
                                }
                              >
                                Retry save
                              </Button>
                            )}
                          </div>
                        )}
                        {active && item.bodyweightEligible && !unsupported && (
                          <button
                            type="button"
                            className="add-resistance"
                            onPointerDown={(event) => event.preventDefault()}
                            disabled={!canEdit || !!entry.pending}
                            onClick={() => {
                              change(entry.row.id, {
                                mode:
                                  entry.draft.mode === "bodyweight"
                                    ? "external"
                                    : "bodyweight",
                                weight: "",
                                weightDirty: true,
                                completed: false,
                              });
                              enqueue(entry.row.id);
                            }}
                          >
                            {entry.draft.mode === "bodyweight"
                              ? "+ Add weight"
                              : "Bodyweight only"}
                          </button>
                        )}
                        <details className="set-options">
                          <summary>
                            {setTypes[entry.draft.type]}
                            {effortSummary({
                              effort_scale: entry.draft.effortScale,
                              effort_value: entry.draft.effortValue?.trim()
                                ? Number(entry.draft.effortValue)
                                : null,
                              performed_to_failure: entry.draft.toFailure,
                            }) &&
                              ` · ${effortSummary({ effort_scale: entry.draft.effortScale, effort_value: entry.draft.effortValue?.trim() ? Number(entry.draft.effortValue) : null, performed_to_failure: entry.draft.toFailure })}`}{" "}
                            · Options
                          </summary>
                          {active && (
                            <Button
                              variant="outline"
                              disabled={
                                (!entry.error && !entry.dirty) ||
                                !!entry.pending
                              }
                              onClick={async () => {
                                const result = await readSetRows(item.id);
                                if (result.error) {
                                  update((old) => ({
                                    ...old,
                                    [entry.row.id]: {
                                      ...old[entry.row.id],
                                      error: result.error,
                                    },
                                  }));
                                  return;
                                }
                                const saved = result.rows?.find(
                                  (r) => r.id === entry.row.id,
                                );
                                update((old) => {
                                  const next = { ...old };
                                  if (saved)
                                    next[entry.row.id] = {
                                      row: saved,
                                      draft: draftFor(saved, unit),
                                      seq: 0,
                                      dirty: false,
                                      pending: 0,
                                    };
                                  else delete next[entry.row.id];
                                  return next;
                                });
                              }}
                            >
                              Discard this draft and use saved values
                            </Button>
                          )}
                          <label>
                            Set type
                            <select
                              aria-label={`${item.name} set ${i + 1} type`}
                              disabled={
                                !canEdit || unsupported || !!entry.pending
                              }
                              value={entry.draft.type}
                              onChange={(e) => {
                                change(entry.row.id, {
                                  type: e.target.value as SetDraft["type"],
                                });
                                enqueue(entry.row.id);
                              }}
                            >
                              {Object.entries(setTypes).map(
                                ([value, label]) => (
                                  <option
                                    key={value}
                                    value={value}
                                    disabled={
                                      value === "warm_up" &&
                                      entry.draft.toFailure
                                    }
                                  >
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <div className="advanced-effort-controls">
                            <label>
                              <input
                                type="checkbox"
                                aria-label={`${item.name} set ${i + 1} To Failure`}
                                checked={entry.draft.toFailure ?? false}
                                disabled={
                                  !canEdit ||
                                  unsupported ||
                                  !!entry.pending ||
                                  entry.draft.type === "warm_up"
                                }
                                onChange={(e) => {
                                  change(entry.row.id, {
                                    toFailure: e.target.checked,
                                  });
                                  enqueue(entry.row.id);
                                }}
                              />{" "}
                              To Failure
                            </label>
                            <small>
                              Reported inability to complete another rep with
                              acceptable technique. Clear this flag before
                              choosing Warm-up.
                            </small>
                            <label>
                              Effort scale
                              <select
                                aria-label={`${item.name} set ${i + 1} effort scale`}
                                value={
                                  entry.draft.effortScale ??
                                  workout.preferredEffortScale ??
                                  "rpe"
                                }
                                disabled={
                                  !canEdit || unsupported || !!entry.pending
                                }
                                onChange={(e) => {
                                  change(entry.row.id, {
                                    effortScale: e.target.value as EffortScale,
                                    effortValue: "",
                                  });
                                  enqueue(entry.row.id);
                                }}
                              >
                                <option value="rpe">RPE</option>
                                <option value="rir">RIR</option>
                              </select>
                            </label>
                            <label>
                              Effort rating · optional
                              <select
                                aria-label={`${item.name} set ${i + 1} effort rating`}
                                value={entry.draft.effortValue ?? ""}
                                disabled={
                                  !canEdit || unsupported || !!entry.pending
                                }
                                onChange={(e) => {
                                  change(entry.row.id, {
                                    effortScale:
                                      entry.draft.effortScale ??
                                      workout.preferredEffortScale ??
                                      "rpe",
                                    effortValue: e.target.value,
                                  });
                                  enqueue(entry.row.id);
                                }}
                              >
                                <option value="">No rating</option>
                                {(entry.draft.effortScale ??
                                  workout.preferredEffortScale ??
                                  "rpe") === "rpe"
                                  ? rpeValues.map((v) => (
                                      <option key={v} value={v}>
                                        {v}
                                      </option>
                                    ))
                                  : rirValues.map((v) => (
                                      <option key={v} value={v}>
                                        {v === 5 ? "5+" : v}
                                      </option>
                                    ))}
                              </select>
                            </label>
                            <small>
                              {(entry.draft.effortScale ??
                                workout.preferredEffortScale ??
                                "rpe") === "rpe"
                                ? "RPE 6–10 describes perceived effort; 10 means maximal reported effort."
                                : "RIR estimates additional reps available; 5+ means at least five."}{" "}
                              Switching scales clears the rating without
                              conversion. Failure stays independent. Choose your
                              default in Profile Settings.
                            </small>
                          </div>
                          {item.bodyweightEligible && (
                            <label>
                              Load recording
                              <select
                                aria-label={`${item.name} set ${i + 1} load mode`}
                                disabled={
                                  !canEdit || unsupported || !!entry.pending
                                }
                                value={entry.draft.mode}
                                onChange={(e) => {
                                  change(entry.row.id, {
                                    mode: e.target.value as SetDraft["mode"],
                                    weight: "",
                                    weightDirty: true,
                                  });
                                  enqueue(entry.row.id);
                                }}
                              >
                                <option value="bodyweight">
                                  Bodyweight · no added load
                                </option>
                                <option value="external">
                                  Added external load
                                </option>
                              </select>
                            </label>
                          )}
                          {active && (
                            <div className="set-option-actions">
                              <Button
                                variant="outline"
                                disabled={
                                  !canEdit || i === 0 || pending || dirty
                                }
                                onClick={() =>
                                  enqueue(entry.row.id, "move", -1)
                                }
                                aria-label={`Move ${item.name} set ${i + 1} up`}
                              >
                                ↑
                              </Button>
                              <Button
                                variant="outline"
                                disabled={
                                  !canEdit ||
                                  i === visible.length - 1 ||
                                  pending ||
                                  dirty
                                }
                                onClick={() => enqueue(entry.row.id, "move", 1)}
                                aria-label={`Move ${item.name} set ${i + 1} down`}
                              >
                                ↓
                              </Button>
                              <Button
                                variant="outline"
                                disabled={!canEdit || !!entry.pending}
                                onClick={() => enqueue(entry.row.id, "remove")}
                                aria-label={`Delete ${item.name} set ${i + 1}`}
                              >
                                Delete set
                              </Button>
                            </div>
                          )}
                        </details>
                      </div>
                    ))}
                    {active && (
                      <Button
                        variant="outline"
                        disabled={
                          !canEdit ||
                          unsupported ||
                          visible.some((e) => e.localOnly)
                        }
                        onClick={() => add(item.id, item.bodyweightEligible)}
                        aria-label={`Add set to ${item.name}`}
                      >
                        Add set
                      </Button>
                    )}
                    <div className="exercise-resources">
                      {" "}
                      <details className="exercise-logger-instructions">
                        <summary>Exercise instructions</summary>
                        <Link
                          href={exerciseHref(
                            item.exerciseId,
                            workout.id,
                            undefined,
                            false,
                            item.id,
                          )}
                        >
                          Exercise details →
                        </Link>
                        <ExerciseThumbnail
                          visual={item.visual}
                          size={128}
                          decorative={false}
                        />
                        <p className="exercise-instructions">
                          {item.instructions ||
                            "No instructions available. Use a comfortable range and seek qualified guidance for unfamiliar movements."}
                        </p>
                      </details>
                      {item.sets.some((s) => s.suggested_from_date) && (
                        <p className="set-source">
                          {movement?.suggested
                            ? "Defaults from previous workout · Suggested reps"
                            : item.programMovementId
                              ? "Previous performance · Planned reps from program"
                              : "Defaults from previous workout"}{" "}
                          ·{" "}
                          <LocalTime
                            value={
                              item.sets.find((s) => s.suggested_from_date)
                                ?.suggested_from_date ?? workout.startedAt
                            }
                          />
                        </p>
                      )}
                      <p className="auth-links">
                        <Link
                          href={exerciseHref(
                            item.exerciseId,
                            active ? workout.id : undefined,
                            undefined,
                            true,
                            item.id,
                          )}
                        >
                          Look Back
                        </Link>
                      </p>
                    </div>
                    {active && !movement && (
                      <ItemControls
                        sessionId={workout.id}
                        item={{
                          ...item,
                          canRemove:
                            item.canRemove &&
                            Object.values(entries)
                              .filter(
                                (e) => e.row.workout_exercise_id === item.id,
                              )
                              .every(
                                (e) =>
                                  e.row.is_automatic &&
                                  e.row.inputs_confirmed === false &&
                                  !e.dirty &&
                                  !e.pending,
                              ),
                        }}
                        first={workout.items[0]?.id === item.id}
                        last={workout.items.at(-1)?.id === item.id}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </fieldset>
          <Button variant="outline" asChild>
            <Link href={loggerHref(workout.id)}>Back to Workout Home</Link>
          </Button>
        </section>
      )}
      {home &&
        (active ? (
          <section className="workout-ending">
            <h2 className="sr-only">Workout actions</h2>
            <p>
              Completed and pending sets will be preserved exactly as saved.
              Pending sets will not be marked complete.
            </p>
            {dirty && (
              <p role="status">Resolve unsaved edits before closing.</p>
            )}
            {incomplete && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                Finish without completing all sets ({summary.pending} pending;{" "}
                {missing}{" "}
                {workout.movements?.length ? "movements" : "exercises"} missing
                sets)
              </label>
            )}
            <div className="workout-ending-actions">
              <CloseWorkout
                sessionId={workout.id}
                outcome="completed"
                disabled={!canEdit || dirty || (incomplete && !ack)}
              />
              <details>
                <summary>Abandon instead</summary>
                <CloseWorkout
                  sessionId={workout.id}
                  outcome="abandoned"
                  disabled={!canEdit || dirty}
                />
              </details>
            </div>
          </section>
        ) : (
          <section className="library-section">
            <p>
              {workout.completionStatus === "none"
                ? "No completed sets were recorded. This status describes the workout session only."
                : `Recorded completion: ${workout.completionStatus}. Saved performance is read-only here.`}
            </p>
            <Link href="/workout">Back to workouts</Link>
          </section>
        ))}
    </div>
  );
}
function displayRemote(row: LoggedSet, unit: WeightUnit) {
  return `${draftFor(row, unit).weight || "no load"} ${unit}, ${row.actual_reps ?? "blank"} reps, ${row.status}`;
}
