"use client";
import {
  WorkoutClosureProvider,
  FinishWorkout,
} from "@/components/workouts/workout-closure";
import { ExerciseCompletionActions } from "@/components/workouts/exercise-completion-actions";
import { exerciseSetsConfirmed } from "@/features/workouts/exercise-completion";
import { SuggestedMovementControls } from "@/components/workouts/suggested-movement-controls";
import { ExerciseNavigation } from "@/components/workouts/exercise-navigation";
import { newerTimerState } from "@/features/continuity/timer";
import { WorkoutModeControls } from "@/components/workouts/workout-mode-controls";
import { workoutProgress } from "@/features/workouts/progress";
import { MovementSelection } from "@/components/programs/movement-selection";
import { effortSummary } from "@/features/sets/effort";
import { SetEffortOptions } from "./set-effort-options";
import { SetOptionHelp } from "./set-option-help";
import { SetSettings } from "@/components/workouts/settings-sheet";
import { CardioEntry } from "@/components/cardio/cardio-entry";
import {
  activities,
  cardioMinutes,
  cardioTotals,
} from "@/features/cardio/model";
import { MovementActions } from "@/components/workouts/movement-actions";
import {
  SupersetBuilder,
  type GroupOption,
} from "@/components/grouping/superset-builder";
import {
  CreateSupersetButton,
  GroupActions,
} from "@/components/grouping/group-actions";
import { changeGroup } from "@/features/grouping/actions";
import {
  groupRounds,
  groupItems,
  memberKey,
  orderedGroups,
  type ExerciseGroup,
  type GroupCommand,
  type GroupMember,
} from "@/features/grouping/model";
import { Link2 } from "lucide-react";
import { LocalTime } from "@/components/history/local-time";
import { friendlyWorkoutName } from "@/features/history/model";
import Link from "next/link";
import { WorkoutCheckIn } from "@/components/continuity/workout-check-in";
import { readWorkoutContinuity } from "@/features/continuity/actions";
import {
  closureExplanation,
  type Continuity,
} from "@/features/continuity/model";
import {
  exerciseHref,
  loggerHref,
  groupLoggerHref,
} from "@/features/workouts/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Workout, WorkoutItem } from "@/features/workouts/types";
import { isUuid } from "@/features/exercises/validation";
import { mutateSet, readSetRows } from "@/features/sets/actions";
import {
  draftFor,
  newSetDraft,
  compareSets,
  valuesFor,
  setFieldErrors,
  SetValidationError,
  type SetFieldErrors,
  summarizeSets,
  setTypes,
  type LoggedSet,
  type SetDraft,
  type SetCommand,
  type WeightUnit,
} from "@/features/sets/model";
import { ExerciseThumbnail } from "@/components/exercises/exercise-thumbnail";
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
  fields?: SetFieldErrors;
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
  focusedGroupId,
  trainingAccess = true,
}: {
  workout: Workout;
  focusedItemId?: string;
  focusedGroupId?: string;
  trainingAccess?: boolean;
}) {
  const focusedItem = workout.items.find((i) => i.id === focusedItemId);
  const focusedMovement = workout.movements?.find(
    (m) => m.id === focusedItem?.programMovementId,
  );
  const [groups, setGroups] = useState<ExerciseGroup[]>(workout.groups ?? []);
  useEffect(() => {
    setGroups(workout.groups ?? []);
  }, [workout.groups]);
  const focusedGroup = groups.find((g) => g.id === focusedGroupId);
  const home = !focusedItem && !focusedGroup;
  const [groupBusy, setGroupBusy] = useState(false),
    [groupError, setGroupError] = useState("");
  const [editor, setEditor] = useState<{
    id: string;
    group?: ExerciseGroup;
    target: HTMLElement | null;
  } | null>(null);
  const groupRequest = useRef<GroupCommand | null>(null);
  const groupWriting = useRef(false);
  function openGroup(group?: ExerciseGroup, target: HTMLElement | null = null) {
    setGroupError("");
    setEditor({ id: group?.id ?? crypto.randomUUID(), group, target });
  }
  async function applyGroup(
    id: string,
    group: ExerciseGroup | undefined,
    members: GroupMember[],
    retry?: GroupCommand,
  ) {
    if (groupWriting.current) return false;
    if (dirtyRef.current || !canEdit) {
      setGroupError(
        "Save or discard set edits before grouping; refresh if the workout closed.",
      );
      return false;
    }
    const operation =
      retry?.operation ??
      (group && members.length < 2 ? "ungroup" : group ? "edit" : "create");
    const payload = {
      session: workout.id,
      group: id,
      operation,
      expected: retry?.expected ?? group?.revision ?? 0,
      members: retry?.members ?? (operation === "ungroup" ? [] : members),
    } as const;
    const previous = groupRequest.current;
    if (retry) groupRequest.current = retry;
    else if (
      !previous ||
      JSON.stringify({ ...previous, request: undefined }) !==
        JSON.stringify(payload)
    )
      groupRequest.current = { ...payload, request: crypto.randomUUID() };
    const command = groupRequest.current;
    if (!command) return false;
    groupWriting.current = true;
    const previousFocus = document.activeElement;
    setGroupBusy(true);
    setGroupError("");
    let result: Awaited<ReturnType<typeof changeGroup>>;
    try {
      result = await changeGroup(command);
    } catch {
      result = {
        error:
          "The Superset change could not be confirmed. Retry when connected.",
      };
    }
    groupWriting.current = false;
    setGroupBusy(false);
    if (result.error || !result.groups) {
      setGroupError(result.error ?? "Superset not confirmed. Retry.");
      return false;
    }
    setGroups(result.groups);
    groupRequest.current = null;
    setExpanded(null);
    setSetSettings(null);
    router.refresh();
    if (operation === "ungroup")
      requestAnimationFrame(() => {
        if (
          previousFocus &&
          !previousFocus.isConnected &&
          document.activeElement === document.body
        )
          document
            .querySelector<HTMLButtonElement>(".create-superset-shortcut")
            ?.focus({ preventScroll: true });
      });
    return true;
  }
  const [expanded, setExpanded] = useState<string | null>(null);
  // Presentation-only interaction generations. Native details retain their own
  // open state; newer pointer, keyboard or assistive clicks cancel old collapses.
  const optionsInteractions = useRef(new Map<string, number>());
  function noteOptionsInteraction(id: string) {
    optionsInteractions.current.set(
      id,
      (optionsInteractions.current.get(id) ?? 0) + 1,
    );
  }
  const screenIdentity = focusedGroupId ?? focusedItemId;
  const previousScreen = useRef(screenIdentity);
  useLayoutEffect(() => {
    if (previousScreen.current === screenIdentity) return;
    previousScreen.current = screenIdentity;
    // Never move the page after an initial SSR click has already begun.
    // Screen-change focus runs before paint, while the queue remains mounted.
    document.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [screenIdentity]);
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
  const [cardioBusy, setCardioBusy] = useState(false),
    [cardioDirty, setCardioDirty] = useState(false);
  const [setSettings, setSetSettings] = useState<string | null>(null);
  const cardioTotal = cardioTotals(workout.cardio);
  const [continuity, setContinuity] = useState<Continuity | null>(
    workout.continuity ?? null,
  );
  useEffect(() => {
    const next = workout.continuity;
    if (next) setContinuity((old) => (newerTimerState(next, old) ? next : old));
  }, [workout.continuity]);
  const acceptContinuity = useCallback((next: Continuity) => {
    setContinuity((old) => (newerTimerState(next, old) ? next : old));
  }, []);
  const active = workout.status === "in_progress";
  const [checkInBusy, setCheckInBusy] = useState(false);
  const canEdit =
    trainingAccess &&
    active &&
    !checkInBusy &&
    !groupBusy &&
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
  dirtyRef.current = dirty || cardioDirty || cardioBusy;
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
      const navigation = (event.target as Element).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        navigation &&
        navigation.origin === location.origin &&
        (navigation.pathname !== location.pathname ||
          navigation.search !== location.search)
      )
        setSetSettings(null);
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
        acceptContinuity(result.data);
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
  }, [workout.id, router, acceptContinuity]);
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
        fields: old[id].fields
          ? setFieldErrors(
              { ...old[id].draft, ...patch, completed: true },
              unitRef.current,
              old[id].row,
            )
          : undefined,
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
    // Clicking Retry can blur an unchanged failed field first. That blur is
    // the same uncertain operation, not a new edit against a stale revision.
    // A changed draft has a new sequence and must keep ordinary CAS behavior.
    retry ??=
      operation === "save" &&
      entry.seq === entry.retrySeq &&
      (entry.retry?.operation === "save" ||
        (entry.localOnly && entry.retry?.operation === "add"))
        ? entry.retry
        : undefined;
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
          error:
            error instanceof SetValidationError
              ? undefined
              : error instanceof Error
                ? error.message
                : "Check values.",
          fields:
            error instanceof SetValidationError ? error.fields : undefined,
          dirty: true,
        },
      }));
      cacheDraftsNow();
      return;
    }
    const snapshot = entry.seq;
    const completionIntent =
      values.completed && entry.row.status !== "completed";
    const optionsInteraction = optionsInteractions.current.get(id) ?? 0;
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
              if (value.data) acceptContinuity(value.data);
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
          void readWorkoutContinuity(workout.id).then((result) => {
            if (result.data) acceptContinuity(result.data);
          });
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
              : !existing.dirty &&
                !existing.pending &&
                !existing.error &&
                !Object.keys(existing.fields ?? {}).length;
            next[row.id] = {
              ...existing,
              row,
              draft: unchanged
                ? own &&
                  command.operation === "save" &&
                  row.inputs_confirmed === false
                  ? // A deliberate pending save of NULL actuals may leave the
                    // automatic row unconfirmed. Do not reapply suggestions over
                    // the user's explicit blanks on its acknowledgement.
                    {
                      ...draftFor(
                        row,
                        unitRef.current,
                        existing.draft.effortScale,
                      ),
                      weight: existing.draft.weight,
                      reps: existing.draft.reps,
                      weightDirty: existing.draft.weightDirty,
                    }
                  : draftFor(row, unitRef.current, existing.draft.effortScale)
                : existing.draft,
              dirty: unchanged ? false : existing.dirty,
              fields: unchanged ? undefined : existing.fields,
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
        const accepted = ref.current[id];
        if (
          completionIntent &&
          !result.error &&
          accepted &&
          accepted.seq === snapshot &&
          !accepted.dirty &&
          !accepted.pending &&
          !accepted.error &&
          !accepted.conflict &&
          accepted.row.status === "completed" &&
          accepted.row.inputs_confirmed === true &&
          accepted.row.last_mutation_id === command.mutation &&
          (optionsInteractions.current.get(id) ?? 0) === optionsInteraction
        ) {
          setSetSettings((current) => (current === id ? null : current));
        }
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
  const incomplete =
    summary.pending > 0 || missing > 0 || cardioTotal.pending > 0;
  const focusedEntries = Object.values(entries).filter(
    (entry) => entry.row.workout_exercise_id === focusedItem?.id,
  );
  const exerciseComplete =
    !!focusedItem &&
    canEdit &&
    !dirty &&
    !pending &&
    focusedItem.loggingKind !== "duration" &&
    focusedItem.loggingKind !== "assisted" &&
    exerciseSetsConfirmed(focusedEntries);

  function renderSet(
    entry: Entry,
    item: WorkoutItem,
    i: number,
    showLoad: boolean,
    unsupported: boolean,
    visibleCount: number,
    uniformTarget = false,
  ) {
    return (
      <div
        key={entry.row.id}
        className={`logged-set ${entry.row.status === "completed" ? "is-complete" : ""}`}
        data-set-id={entry.row.id}
      >
        {item.programMovementId &&
          !uniformTarget &&
          entry.row.prescribed_reps_min != null && (
            <PrescribedTarget row={entry.row} />
          )}
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
              aria-invalid={!!entry.fields?.weight}
              aria-describedby={
                entry.fields?.weight
                  ? `set-weight-error-${entry.row.id}`
                  : undefined
              }
              inputMode="decimal"
              autoComplete="off"
              value={entry.draft.weight}
              placeholder="—"
              disabled={!canEdit || unsupported || entry.deleting}
              onChange={(e) =>
                change(entry.row.id, {
                  weight: e.target.value,
                  weightDirty: true,
                })
              }
              onBlur={() => {
                if (ref.current[entry.row.id].dirty) enqueue(entry.row.id);
              }}
            />
          )}
          <input
            aria-label={`${item.name} set ${i + 1} reps`}
            aria-invalid={!!entry.fields?.reps}
            aria-describedby={
              entry.fields?.reps ? `set-reps-error-${entry.row.id}` : undefined
            }
            inputMode="numeric"
            autoComplete="off"
            value={entry.draft.reps}
            placeholder="—"
            disabled={!canEdit || unsupported || entry.deleting}
            onChange={(e) => change(entry.row.id, { reps: e.target.value })}
            onBlur={() => {
              if (ref.current[entry.row.id].dirty) enqueue(entry.row.id);
            }}
          />
          <label className="set-completion-control">
            <input
              aria-label={`${item.name} set ${i + 1} complete`}
              type="checkbox"
              checked={entry.row.status === "completed"}
              disabled={!canEdit || unsupported || !!entry.pending}
              onPointerDown={(e) => e.preventDefault()}
              onChange={(e) => {
                const current = ref.current[entry.row.id];
                if (!current || current.pending) return;
                const completed = e.target.checked;
                const fields = setFieldErrors(
                  { ...current.draft, completed },
                  unitRef.current,
                  current.row,
                );
                if (Object.keys(fields).length) {
                  update((old) => ({
                    ...old,
                    [entry.row.id]: {
                      ...old[entry.row.id],
                      // Validation is a newer interaction even when the
                      // values have not changed. An earlier blur save
                      // must not erase its feedback on acknowledgement.
                      seq: old[entry.row.id].seq + 1,
                      fields,
                    },
                  }));
                  return;
                }
                try {
                  // Effort/type constraints are part of the same
                  // synchronous validation, before changing intent.
                  valuesFor(
                    { ...current.draft, completed },
                    unitRef.current,
                    current.row,
                  );
                } catch (error) {
                  update((old) => ({
                    ...old,
                    [entry.row.id]: {
                      ...old[entry.row.id],
                      dirty: true,
                      error:
                        error instanceof Error
                          ? error.message
                          : "Check set values.",
                    },
                  }));
                  cacheDraftsNow();
                  return;
                }
                change(entry.row.id, { completed });
                enqueue(entry.row.id);
              }}
            />
          </label>
          <SetSettings
            label={`${item.name} set ${i + 1} settings`}
            title={`Set ${i + 1} settings`}
            open={setSettings === entry.row.id}
            onOpenChange={(open) => {
              noteOptionsInteraction(entry.row.id);
              setSetSettings((current) =>
                open ? entry.row.id : current === entry.row.id ? null : current,
              );
            }}
            disabled={!canEdit || unsupported || entry.deleting}
            id={`set-options-${entry.row.id}`}
            className="set-settings"
            onInteract={() => noteOptionsInteraction(entry.row.id)}
          >
            <div className="set-option-body">
              {active &&
                (entry.error ||
                  entry.dirty ||
                  entry.conflict ||
                  entry.localOnly) && (
                  <Button
                    variant="outline"
                    disabled={!!entry.pending}
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
              <div className="set-option-field">
                <div className="set-option-label">
                  <label htmlFor={`set-type-${entry.row.id}`}>Set type</label>
                  <SetOptionHelp title="set type">
                    Warm-up sets prepare you for training. Working and advanced
                    sets use the existing eligible-performance rules.
                  </SetOptionHelp>
                </div>
                <select
                  id={`set-type-${entry.row.id}`}
                  aria-label={`${item.name} set ${i + 1} type`}
                  disabled={!canEdit || unsupported || !!entry.pending}
                  value={entry.draft.type}
                  onChange={(e) => {
                    change(entry.row.id, {
                      type: e.target.value as SetDraft["type"],
                    });
                    enqueue(entry.row.id);
                  }}
                >
                  {Object.entries(setTypes).map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                      disabled={value === "warm_up" && entry.draft.toFailure}
                    >
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <SetEffortOptions
                draft={entry.draft}
                preferredScale={workout.preferredEffortScale ?? "rpe"}
                name={`${item.name} set ${i + 1}`}
                disabled={!canEdit || unsupported || !!entry.pending}
                onChange={(patch) => {
                  change(entry.row.id, patch);
                  enqueue(entry.row.id);
                }}
              />
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
              {item.bodyweightEligible && (
                <label>
                  Load recording
                  <select
                    aria-label={`${item.name} set ${i + 1} load mode`}
                    disabled={!canEdit || unsupported || !!entry.pending}
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
                    <option value="external">Added external load</option>
                  </select>
                </label>
              )}
              {active && (
                <div className="set-option-actions">
                  <Button
                    variant="outline"
                    disabled={!canEdit || i === 0 || pending || dirty}
                    onClick={() => enqueue(entry.row.id, "move", -1)}
                    aria-label={`Move ${item.name} set ${i + 1} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      !canEdit || i === visibleCount - 1 || pending || dirty
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
            </div>
          </SetSettings>
        </div>
        {Object.keys(entry.fields ?? {}).length > 0 && (
          <div
            className="set-field-errors"
            aria-live="polite"
            aria-atomic="true"
          >
            {entry.fields?.weight && (
              <span id={`set-weight-error-${entry.row.id}`}>
                {entry.fields.weight}
              </span>
            )}
            {entry.fields?.reps && (
              <span id={`set-reps-error-${entry.row.id}`}>
                {entry.fields.reps}
              </span>
            )}
          </div>
        )}
        <div className="set-save-state" role="status">
          {Object.keys(entry.fields ?? {}).length
            ? "Check set values"
            : entry.pending
              ? "Saving…"
              : entry.error
                ? "Not saved"
                : entry.dirty
                  ? "Unsaved changes"
                  : "Saved"}
          {entry.row.inputs_confirmed === false && entry.row.suggested_from_date
            ? " · suggested"
            : ""}
          {entry.draft.mode === "bodyweight" ? " · Bodyweight" : ""}
        </div>
        {entry.error && (
          <div className="set-error" role="alert">
            <p>{entry.error}</p>
            {entry.conflict ? (
              <>
                <p>Saved elsewhere: {displayRemote(entry.conflict, unit)}</p>
                <Button
                  variant="outline"
                  onClick={() =>
                    update((old) => ({
                      ...old,
                      [entry.row.id]: {
                        ...old[entry.row.id],
                        row: entry.conflict ?? entry.row,
                        draft: draftFor(entry.conflict ?? entry.row, unit),
                        dirty: false,
                        fields: undefined,
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
      </div>
    );
  }
  const sortedGroups = orderedGroups(
    groups,
    progress.map((p) =>
      memberKey({ type: p.movement ? "movement" : "selection", id: p.id }),
    ),
  );
  const options: GroupOption[] = progress.map((p) => ({
    member: { type: p.movement ? "movement" : "selection", id: p.id },
    label: p.movement?.label ?? p.items[0]?.name ?? "Movement",
    exercise: p.movement
      ? p.items.find((i) => i.id === p.movement?.currentItemId)?.name
      : undefined,
    unavailable: groups.some(
      (g) =>
        g.id !== editor?.group?.id &&
        g.members.some(
          (m) =>
            m.id === p.id && m.type === (p.movement ? "movement" : "selection"),
        ),
    ),
  }));
  const groupedEntries =
    focusedGroup?.members.map((member) => ({
      member,
      entries: groupItems(workout, member).flatMap((item) => {
        const visible = Object.values(entries)
          .filter(
            (e) => e.row.workout_exercise_id === item.id && !e.row.deleted_at,
          )
          .sort((a, b) => compareSets(a.row, b.row));
        return visible.map((entry, index) => ({
          row: entry.row,
          entry,
          item,
          index,
          visibleCount: visible.length,
          showLoad:
            !item.bodyweightEligible ||
            visible.some((e) => e.draft.mode === "external"),
          unsupported:
            item.loggingKind === "duration" || item.loggingKind === "assisted",
        }));
      }),
    })) ?? [];
  const rounds = groupRounds(groupedEntries, ({ entry }) =>
    exerciseSetsConfirmed([entry]),
  );
  const groupConfirmed =
    !!focusedGroup &&
    groupedEntries.length === focusedGroup.members.length &&
    groupedEntries.every((m) =>
      exerciseSetsConfirmed(m.entries.map((e) => e.entry)),
    );
  const nextGroupRow = rounds
    .flatMap((r) => r.entries)
    .find((e) => !exerciseSetsConfirmed([e.entry.entry]))?.entry.row;
  return (
    <WorkoutClosureProvider
      key={workout.id}
      session={workout.id}
      disabled={
        (trainingAccess && !canEdit) ||
        dirty ||
        pending ||
        groupBusy ||
        cardioBusy ||
        cardioDirty
      }
    >
      <div
        className={`workout-execution active-workout-mode ${trainingAccess ? "" : "training-access-restricted"} ${home ? "workout-home-screen" : "workout-exercise-screen"}`}
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
          <h1 tabIndex={-1}>
            {home
              ? friendlyWorkoutName(workout.name)
              : focusedGroup
                ? `Superset ${sortedGroups.findIndex((g) => g.id === focusedGroup.id) + 1}`
                : (focusedMovement?.label ?? focusedItem?.name)}
          </h1>
          {workout.finishedAt && (
            <p>
              Closed <LocalTime value={workout.finishedAt} />
            </p>
          )}
          {home && (
            <CreateSupersetButton
              compact
              disabled={!canEdit || dirty || pending}
              onOpen={(target) => openGroup(undefined, target)}
            />
          )}
        </div>
        {groupError && !editor && (
          <div role="alert" className="draft-warning">
            <p>{groupError}</p>
            <Button
              variant="outline"
              disabled={groupBusy || dirty || pending}
              onClick={() => {
                const command = groupRequest.current;
                if (command)
                  void applyGroup(
                    command.group,
                    groups.find((g) => g.id === command.group),
                    command.members,
                    command,
                  );
              }}
            >
              Retry Superset Change
            </Button>
            <Button variant="outline" onClick={() => router.refresh()}>
              Refresh
            </Button>
          </div>
        )}
        {continuity?.state === "check_in" && !dirty && !pending && (
          <WorkoutCheckIn
            workout={continuity}
            onBusy={setCheckInBusy}
            onState={acceptContinuity}
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
        {!workout.items.length &&
          !workout.movements?.length &&
          !workout.cardio?.length && (
            <section className="empty-state">
              <h2>
                {active
                  ? "No exercises selected yet."
                  : "No exercises selected."}
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
              {(progress.length > 0 || !workout.cardio?.length) && (
                <>
                  {
                    progress.filter((p) => p.progress.status === "Complete")
                      .length
                  }{" "}
                  of {progress.length}{" "}
                  {workout.movements?.length ? "movements" : "exercises"}{" "}
                  complete
                </>
              )}
              {!!workout.cardio?.length && (
                <>
                  {progress.length > 0 ? " · " : ""}
                  {cardioTotal.completed} of {workout.cardio.length} cardio
                  activities recorded
                </>
              )}
            </p>
            <ol className="workout-items" aria-label="Workout movements">
              {progress.map((group, index) => {
                const identity: GroupMember = {
                  type: group.movement ? "movement" : "selection",
                  id: group.id,
                };
                const superset = groups.find((g) =>
                  g.members.some((m) => memberKey(m) === memberKey(identity)),
                );
                if (superset) {
                  const anchor = progress.find((p) =>
                    superset.members.some(
                      (m) =>
                        m.id === p.id &&
                        m.type === (p.movement ? "movement" : "selection"),
                    ),
                  );
                  if (
                    !anchor ||
                    memberKey({
                      type: anchor.movement ? "movement" : "selection",
                      id: anchor.id,
                    }) !== memberKey(identity)
                  )
                    return null;
                  const number =
                      sortedGroups.findIndex((g) => g.id === superset.id) + 1,
                    label = `Superset ${number}`,
                    open = expanded === `group:${superset.id}`;
                  const members = superset.members.map((m) =>
                    progress.find(
                      (p) =>
                        p.id === m.id &&
                        m.type === (p.movement ? "movement" : "selection"),
                    ),
                  );
                  const ready = members.every((p) => p && p.items.length > 0),
                    complete = members.every(
                      (p) => p?.progress.status === "Complete",
                    );
                  return (
                    <li
                      key={`group:${superset.id}`}
                      className="workout-item movement-home-card superset-card"
                      data-group-id={superset.id}
                    >
                      <div className="superset-heading">
                        <button
                          type="button"
                          className="superset-expand"
                          aria-expanded={open}
                          aria-controls={`group-body-${superset.id}`}
                          onClick={() =>
                            setExpanded(open ? null : `group:${superset.id}`)
                          }
                        >
                          <Link2 size={18} />
                          <strong>{label}</strong>
                          <span>
                            {complete
                              ? "Complete"
                              : members.some(
                                    (p) => (p?.progress.completed ?? 0) > 0,
                                  )
                                ? "In Progress"
                                : "Not Started"}
                          </span>
                        </button>
                        <GroupActions
                          label={label}
                          disabled={!canEdit || dirty || pending}
                          onEdit={(target) => openGroup(superset, target)}
                          onUngroup={() =>
                            void applyGroup(superset.id, superset, [])
                          }
                          onChoose={() => setExpanded(`group:${superset.id}`)}
                        />
                      </div>
                      <ol className="superset-member-summary">
                        {members.map((p, i) => (
                          <li key={memberKey(superset.members[i])}>
                            <strong>
                              A{i + 1} ·{" "}
                              {p?.movement?.label ??
                                p?.items[0]?.name ??
                                "Unavailable movement"}
                            </strong>
                            <span>
                              {p?.items.at(-1)?.name ?? "Choose exercise"}
                            </span>
                            <small>
                              {p?.progress.status ?? "Unavailable"} ·{" "}
                              {p?.progress.completed ?? 0}
                              {p?.progress.required
                                ? `/${p.progress.required}`
                                : ""}{" "}
                              working sets
                            </small>
                          </li>
                        ))}
                      </ol>
                      <p className="set-source">
                        {members.reduce(
                          (n, p) => n + (p?.progress.completed ?? 0),
                          0,
                        )}
                        {members.every((p) => p?.progress.required)
                          ? `/${members.reduce((n, p) => n + (p?.progress.required ?? 0), 0)}`
                          : ""}{" "}
                        working sets complete
                      </p>
                      <Button
                        disabled={!canEdit || dirty || pending}
                        onClick={() =>
                          ready
                            ? router.push(
                                groupLoggerHref(workout.id, superset.id),
                              )
                            : setExpanded(`group:${superset.id}`)
                        }
                      >
                        {ready
                          ? members.some(
                              (p) => (p?.progress.completed ?? 0) > 0,
                            )
                            ? "Continue Superset"
                            : "Start Superset"
                          : "Choose exercises"}
                      </Button>
                      {open && (
                        <div
                          id={`group-body-${superset.id}`}
                          className="superset-member-pickers"
                        >
                          {members.map((p, i) => (
                            <section
                              key={memberKey(superset.members[i])}
                              aria-label={`A${i + 1} exercise selection`}
                            >
                              <h3>
                                A{i + 1} ·{" "}
                                {p?.movement?.label ?? p?.items[0]?.name}
                              </h3>
                              {p?.movement ? (
                                <MovementSelection
                                  movement={p.movement}
                                  facets={
                                    workout.movementFacets ?? {
                                      patterns: [],
                                      muscles: [],
                                    }
                                  }
                                  disabled={!canEdit || dirty || pending}
                                  onSelected={() => router.refresh()}
                                />
                              ) : (
                                <p>{p?.items[0]?.name}</p>
                              )}
                            </section>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                }
                const movement = group.movement;
                const current =
                  group.items.find((i) => i.id === movement?.currentItemId) ??
                  group.items.at(-1);
                const label = movement
                  ? movement.label
                  : (current?.name ?? `Exercise ${index + 1}`);
                return (
                  <li
                    key={group.id}
                    className="workout-item workout-movement-card"
                    data-movement-id={movement?.id}
                  >
                    <div className="workout-home-heading">
                      <h2>
                        {movement ? (
                          <button
                            className="movement-row-toggle"
                            type="button"
                            aria-label={
                              expanded === group.id
                                ? `Hide exercises · ${movement.label}`
                                : current
                                  ? `Choose or change exercise · ${movement.label}`
                                  : `Choose exercise · ${movement.label}`
                            }
                            aria-describedby={`movement-status-${group.id}`}
                            aria-expanded={expanded === group.id}
                            aria-controls={`selection-${group.id}`}
                            onClick={() =>
                              setExpanded(
                                expanded === group.id ? null : group.id,
                              )
                            }
                          >
                            {label}
                            <span aria-hidden="true">
                              {expanded === group.id ? "−" : "+"}
                            </span>
                          </button>
                        ) : current ? (
                          <Link href={loggerHref(workout.id, current.id)}>
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                      </h2>
                      <MovementActions
                        workout={workout}
                        movement={movement ?? undefined}
                        item={current}
                        disabled={!canEdit || dirty || pending || cardioBusy}
                        grouped={false}
                        onChooseExercise={() => setExpanded(group.id)}
                      />
                      <span
                        id={`movement-status-${group.id}`}
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
                        <span className="sr-only">{group.progress.status}</span>
                      </span>
                    </div>
                    {(current || group.progress.required !== null) && (
                      <p className="movement-selected-summary">
                        {movement && current && (
                          <Link
                            aria-label="Open exercise logger"
                            href={loggerHref(workout.id, current.id)}
                          >
                            {current.name} <span aria-hidden="true">→</span>
                          </Link>
                        )}
                        <span>
                          {group.progress.completed}
                          {group.progress.required !== null
                            ? `/${group.progress.required}`
                            : ""}{" "}
                          working sets complete
                        </span>
                      </p>
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
                        {expanded === group.id &&
                          group.items
                            .filter((i) => i.id !== current?.id)
                            .map((i) => (
                              <p className="set-source" key={i.id}>
                                <Link href={loggerHref(workout.id, i.id)}>
                                  Earlier exercise · {i.name}
                                </Link>
                              </p>
                            ))}
                      </>
                    ) : null}
                  </li>
                );
              })}
              {(workout.cardio ?? []).map((item) => (
                <li
                  key={item.id}
                  className="workout-item workout-movement-card cardio-card"
                  data-cardio-id={item.id}
                >
                  <div>
                    <h2>Cardio · {activities[item.activity]}</h2>
                    <p className="set-source">
                      {item.durationSeconds === null
                        ? "Duration not recorded"
                        : `${cardioMinutes(item.durationSeconds)} recorded`}
                    </p>
                  </div>
                  <CardioEntry
                    key={`${item.id}:${item.revision}`}
                    session={workout.id}
                    item={item}
                    disabled={!canEdit || dirty || pending}
                    onBusy={setCardioBusy}
                    onDirty={setCardioDirty}
                  />
                </li>
              ))}
            </ol>
          </section>
        ) : focusedGroup ? (
          <section
            className="workout-screen superset-logger"
            aria-label="Superset Logger"
          >
            <Button
              variant="outline"
              disabled={!canEdit || dirty || pending}
              onClick={() => {
                setExpanded(`group:${focusedGroup.id}`);
                router.push(loggerHref(workout.id));
              }}
            >
              Change exercises
            </Button>
            {rounds.map((round) => (
              <section
                className="superset-round"
                key={round.number}
                aria-label={`Round ${round.number}`}
              >
                <h2>
                  Round {round.number}
                  {round.completed ? " · Saved" : ""}
                </h2>
                {round.entries.map(({ entry: row, label }) => (
                  <div
                    className={`superset-round-member ${nextGroupRow?.id === row.row.id ? "superset-up-next" : ""}`}
                    key={row.row.id}
                  >
                    <h3>
                      {label} · {row.item.name}
                      <small>
                        {nextGroupRow?.id === row.row.id ? "Up next" : ""}
                      </small>
                    </h3>
                    <div
                      className={`set-grid set-head ${row.showLoad ? "" : "reps-first"}`}
                      aria-hidden="true"
                    >
                      <span>Set</span>
                      {row.showLoad && (
                        <span>
                          {row.item.bodyweightEligible ? "Added " : ""}
                          {unit === "lb" ? "LBS" : "KG"}
                        </span>
                      )}
                      <span>Reps</span>
                      <span>Done</span>
                    </div>
                    {renderSet(
                      row.entry,
                      row.item,
                      row.index,
                      row.showLoad,
                      row.unsupported,
                      row.visibleCount,
                    )}
                  </div>
                ))}
              </section>
            ))}
            <section
              className="superset-add-sets"
              aria-label="Add individual sets"
            >
              {focusedGroup.members.map((member, i) => {
                const item = groupItems(workout, member).at(-1);
                return (
                  item && (
                    <Button
                      key={memberKey(member)}
                      variant="outline"
                      disabled={
                        !canEdit ||
                        groupBusy ||
                        item.loggingKind === "duration" ||
                        item.loggingKind === "assisted" ||
                        Object.values(entries).some(
                          (e) =>
                            e.localOnly &&
                            e.row.workout_exercise_id === item.id,
                        )
                      }
                      onClick={() => add(item.id, item.bodyweightEligible)}
                    >
                      Add A{i + 1} Set
                    </Button>
                  )
                );
              })}
            </section>
          </section>
        ) : focusedItem ? (
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
                {focusedRows.map(({ item, movement }) => {
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
                      <h2 className="sr-only">{item.name}</h2>
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
                      {workout.loadSuggestions?.[item.id] &&
                        (() => {
                          const suggestion = workout.loadSuggestions[item.id];
                          const eligible = visible.filter(
                            (e) =>
                              e.row.status === "pending" &&
                              e.row.inputs_confirmed === false &&
                              e.row.is_automatic &&
                              e.row.set_type === "working" &&
                              e.row.load_mode === "external" &&
                              !e.dirty &&
                              !e.pending &&
                              !e.error &&
                              !e.localOnly &&
                              !e.draft.weightDirty &&
                              e.seq === 0,
                          );
                          return (
                            <div
                              className="load-suggestion"
                              aria-label="Suggested starting weight"
                            >
                              <p>
                                Suggested:{" "}
                                <strong>
                                  {suggestion.display} {workout.weightUnit}
                                </strong>
                                {suggestion.reps
                                  ? ` · aim for ${suggestion.reps} reps`
                                  : ""}
                              </p>
                              <details>
                                <summary>Why this suggestion?</summary>
                                <p>
                                  {suggestion.basis} Adjust to your needs. This
                                  is guidance, not completed performance.
                                </p>
                              </details>
                              {eligible.length > 0 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  aria-label="Use suggested weight"
                                  disabled={
                                    !canEdit || unit !== workout.weightUnit
                                  }
                                  onClick={() => {
                                    // Explicit user action only, through the existing draft and save queue.
                                    // Recheck the current ref: an incoming refresh never replaces typing.
                                    for (const candidate of eligible) {
                                      const current =
                                        ref.current[candidate.row.id];
                                      if (
                                        !current ||
                                        current.dirty ||
                                        current.pending ||
                                        current.seq !== 0 ||
                                        current.row.status !== "pending" ||
                                        current.row.inputs_confirmed !== false
                                      )
                                        continue;
                                      change(current.row.id, {
                                        weight: suggestion.display,
                                        weightDirty: true,
                                      });
                                      enqueue(current.row.id);
                                    }
                                  }}
                                >
                                  Use
                                </Button>
                              )}
                            </div>
                          );
                        })()}
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
                      {visible.map((entry, i) =>
                        renderSet(
                          entry,
                          item,
                          i,
                          showLoad,
                          unsupported,
                          visible.length,
                          uniformTarget,
                        ),
                      )}
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
                    </li>
                  );
                })}
              </ol>
            </fieldset>
          </section>
        ) : null}
        {home && active && (
          <section
            className="workout-management workout-quick-actions"
            aria-label="Workout actions"
          >
            <CreateSupersetButton
              disabled={!canEdit || dirty || pending || cardioBusy}
              onOpen={(target) => openGroup(undefined, target)}
            />
            {trainingAccess ? (
              <Button variant="outline" asChild>
                <Link href={`/workout/${workout.id}/select`}>
                  Add exercises
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Add exercises
              </Button>
            )}
            {!workout.isProgram && workout.movementOptions && (
              <SuggestedMovementControls
                session={workout.id}
                options={workout.movementOptions}
                disabled={!canEdit || dirty || pending || cardioBusy}
              />
            )}
            <CardioEntry
              session={workout.id}
              disabled={!canEdit || dirty || pending}
              onBusy={setCardioBusy}
            />
          </section>
        )}
        {active ? (
          <>
            <WorkoutModeControls
              session={workout.id}
              value={continuity ?? workout.continuity ?? null}
              onState={acceptContinuity}
              home={home}
              backHref={
                home
                  ? workout.isProgram
                    ? "/programs"
                    : "/workout"
                  : loggerHref(workout.id)
              }
              disabled={!canEdit || pending || cardioBusy || cardioDirty}
              exerciseActions={
                focusedGroup && groupConfirmed ? (
                  <Button
                    type="button"
                    disabled={groupBusy}
                    onClick={() => {
                      setExpanded(null);
                      setSetSettings(null);
                      router.push(loggerHref(workout.id));
                    }}
                  >
                    Next Exercise
                  </Button>
                ) : exerciseComplete && focusedItem ? (
                  <ExerciseCompletionActions
                    atLimit={
                      focusedEntries.filter((entry) => !entry.row.deleted_at)
                        .length >= 100
                    }
                    onAdd={() =>
                      add(focusedItem.id, focusedItem.bodyweightEligible)
                    }
                    onHome={() => {
                      setExpanded(null);
                      setSetSettings(null);
                      router.push(loggerHref(workout.id));
                    }}
                  />
                ) : undefined
              }
            >
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
                    Finish without completing all sets ({summary.pending}{" "}
                    pending; {cardioTotal.pending} cardio pending; {missing}{" "}
                    {workout.movements?.length ? "movements" : "exercises"}{" "}
                    missing sets)
                  </label>
                )}
                <div className="workout-ending-actions">
                  <FinishWorkout
                    disabled={!trainingAccess || (incomplete && !ack)}
                  />
                </div>
              </section>
            </WorkoutModeControls>
          </>
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
        {editor && (
          <SupersetBuilder
            key={`${editor.id}:${editor.group?.revision ?? 0}`}
            group={editor.group}
            options={options}
            busy={groupBusy}
            error={groupError}
            returnFocus={editor.target}
            onClose={() => setEditor(null)}
            onSave={(members) => applyGroup(editor.id, editor.group, members)}
          />
        )}
      </div>
    </WorkoutClosureProvider>
  );
}
function displayRemote(row: LoggedSet, unit: WeightUnit) {
  return `${draftFor(row, unit).weight || "no load"} ${unit}, ${row.actual_reps ?? "blank"} reps, ${row.status}`;
}
