"use client";
import { LocalTime } from "@/components/history/local-time";
import { friendlyWorkoutName } from "@/features/history/model";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Workout } from "@/features/workouts/types";
import { describeStatus } from "@/features/workouts/lifecycle";
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
type Entry = {
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
export function WorkoutLogger({ workout }: { workout: Workout }) {
  const [unit, setUnit] = useState(workout.weightUnit);
  const unitRef = useRef(unit);
  unitRef.current = unit;
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      workout.items.flatMap((i) =>
        i.sets.map((row) => [
          row.id,
          { row, draft: draftFor(row, unit), seq: 0, dirty: false, pending: 0 },
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
  const active = workout.status === "in_progress";
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
            !itemsRef.current.some(
              (i) => i.id === entry.row?.workout_exercise_id,
            ) ||
            !entry.draft ||
            typeof entry.draft.weight !== "string" ||
            typeof entry.draft.reps !== "string"
          )
            continue;
          const current = next[id];
          if (current || entry.localOnly)
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
        (link.pathname === location.pathname && link.search === location.search)
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
  }, []);
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
          for (const row of result.rows ?? []) {
            const existing = next[row.id];
            if (!existing) {
              next[row.id] = {
                row,
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
                ? draftFor(row, unitRef.current)
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
      [id]: { row, draft, seq: 0, dirty: true, pending: 0, localOnly: true },
    }));
    enqueue(id, "add");
    setAck(false);
  }
  const itemSets = workout.items.map((item) => ({
    ...item,
    sets: Object.values(entries)
      .filter((e) => e.row.workout_exercise_id === item.id && !e.row.deleted_at)
      .map((e) => e.row),
  }));
  const summary = summarizeSets(itemSets);
  const missing = itemSets.filter(
    (i) => i.sets.length < (i.prescribedSets ?? 1),
  ).length;
  const incomplete = summary.pending > 0 || missing > 0;
  return (
    <div
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
        <Link href="/workout">← Workout</Link>
        <p className="eyebrow">{describeStatus(workout.status)}</p>
        <h1>{friendlyWorkoutName(workout.name)}</h1>
        <p className="intro">
          Started <LocalTime value={workout.startedAt} />
        </p>
        {workout.finishedAt && (
          <p>
            Closed <LocalTime value={workout.finishedAt} />
          </p>
        )}
      </div>
      <p className="logging-summary" role="status">
        {workout.items.length} exercises · {summary.completed} completed sets ·{" "}
        {summary.pending} pending sets
      </p>
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
      <div className="workout-toolbar">
        {active && (
          <Button asChild>
            <Link href={`/workout/${workout.id}/select`}>Add exercises</Link>
          </Button>
        )}
      </div>
      {!workout.items.length && (
        <section className="empty-state">
          <h2>
            {active ? "No exercises selected yet." : "No exercises selected."}
          </h2>
          <p>Choose a movement from your library to get started.</p>
        </section>
      )}
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="sr-only">Workout sets</legend>
        <ol className="workout-items" aria-label="Selected exercises">
          {workout.items.map((item, index) => {
            const visible = Object.values(entries)
              .filter(
                (e) =>
                  e.row.workout_exercise_id === item.id && !e.row.deleted_at,
              )
              .sort((a, b) => compareSets(a.row, b.row));
            const unsupported =
              item.loggingKind === "duration" ||
              item.loggingKind === "assisted";
            const showLoad =
              !item.bodyweightEligible ||
              visible.some((e) => e.draft.mode === "external");
            return (
              <li key={item.id} className="workout-item">
                <div className="workout-item-heading">
                  <ExerciseThumbnail visual={item.visual} />
                  <span className="workout-position">{index + 1}</span>
                  <h2>
                    <Link href={`/exercises/${item.exerciseId}`}>
                      {item.name}
                    </Link>
                  </h2>
                  <span className="set-context">{item.exerciseType}</span>
                </div>
                {item.sets.some((s) => s.suggested_from_date) && (
                  <p className="set-source">
                    Defaults from previous workout ·{" "}
                    <LocalTime
                      value={
                        item.sets.find((s) => s.suggested_from_date)
                          ?.suggested_from_date ?? workout.startedAt
                      }
                    />
                  </p>
                )}
                <p className="auth-links">
                  <Link href={`/exercises/${item.exerciseId}/history`}>
                    Look Back
                  </Link>
                </p>
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
                    <div className={`set-grid ${showLoad ? "" : "reps-first"}`}>
                      <span className="set-number">
                        {entry.draft.type === "warm_up" ? "W" : i + 1}
                      </span>
                      {entry.draft.mode === "bodyweight" ? (
                        showLoad ? (
                          <span className="bodyweight-marker">Bodyweight</span>
                        ) : null
                      ) : (
                        <input
                          aria-label={`${item.name} set ${i + 1} weight in ${unit === "lb" ? "pounds" : "kilograms"}`}
                          inputMode="decimal"
                          autoComplete="off"
                          value={entry.draft.weight}
                          placeholder="—"
                          disabled={!active || unsupported || entry.deleting}
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
                        disabled={!active || unsupported || entry.deleting}
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
                          disabled={!active || unsupported || !!entry.pending}
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
                      {entry.draft.mode === "bodyweight" ? " · Bodyweight" : ""}
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
                        disabled={!!entry.pending}
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
                      <summary>{setTypes[entry.draft.type]} · Options</summary>
                      {active && (
                        <Button
                          variant="outline"
                          disabled={
                            (!entry.error && !entry.dirty) || !!entry.pending
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
                          disabled={!active || unsupported || !!entry.pending}
                          value={entry.draft.type}
                          onChange={(e) => {
                            change(entry.row.id, {
                              type: e.target.value as SetDraft["type"],
                            });
                            enqueue(entry.row.id);
                          }}
                        >
                          {Object.entries(setTypes).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {item.bodyweightEligible && (
                        <label>
                          Load recording
                          <select
                            aria-label={`${item.name} set ${i + 1} load mode`}
                            disabled={!active || unsupported || !!entry.pending}
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
                            disabled={i === 0 || pending || dirty}
                            onClick={() => enqueue(entry.row.id, "move", -1)}
                            aria-label={`Move ${item.name} set ${i + 1} up`}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="outline"
                            disabled={
                              i === visible.length - 1 || pending || dirty
                            }
                            onClick={() => enqueue(entry.row.id, "move", 1)}
                            aria-label={`Move ${item.name} set ${i + 1} down`}
                          >
                            ↓
                          </Button>
                          <Button
                            variant="outline"
                            disabled={!!entry.pending}
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
                    disabled={unsupported || visible.some((e) => e.localOnly)}
                    onClick={() => add(item.id, item.bodyweightEligible)}
                    aria-label={`Add set to ${item.name}`}
                  >
                    Add set
                  </Button>
                )}
                {active && (
                  <ItemControls
                    sessionId={workout.id}
                    item={{
                      ...item,
                      canRemove:
                        item.canRemove &&
                        Object.values(entries)
                          .filter((e) => e.row.workout_exercise_id === item.id)
                          .every(
                            (e) =>
                              e.row.is_automatic &&
                              e.row.inputs_confirmed === false &&
                              !e.dirty &&
                              !e.pending,
                          ),
                    }}
                    first={index === 0}
                    last={index === workout.items.length - 1}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </fieldset>
      {active ? (
        <section className="workout-ending">
          <h2>Ready to close?</h2>
          <p>
            Completed and pending sets will be preserved exactly as saved.
            Pending sets will not be marked complete.
          </p>
          {dirty && <p role="status">Resolve unsaved edits before closing.</p>}
          {incomplete && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              Finish without completing all sets ({summary.pending} pending;{" "}
              {missing} exercises missing sets)
            </label>
          )}
          <div className="workout-ending-actions">
            <CloseWorkout
              sessionId={workout.id}
              outcome="completed"
              disabled={dirty || (incomplete && !ack)}
            />
            <details>
              <summary>Abandon instead</summary>
              <CloseWorkout
                sessionId={workout.id}
                outcome="abandoned"
                disabled={dirty}
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
      )}
    </div>
  );
}
function displayRemote(row: LoggedSet, unit: WeightUnit) {
  return `${draftFor(row, unit).weight || "no load"} ${unit}, ${row.actual_reps ?? "blank"} reps, ${row.status}`;
}
