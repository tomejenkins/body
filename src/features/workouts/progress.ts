import type { Workout, WorkoutItem } from "./types";
import type { LoggedSet } from "@/features/sets/model";
export type MovementStatus = "Not Started" | "In Progress" | "Complete";
// Only server-confirmed, positive-repetition working performance counts here.
// This is movement progress, not PR or session-history eligibility.
export function qualifyingProgressSet(set: LoggedSet) {
  return (
    !set.deleted_at &&
    set.status === "completed" &&
    set.inputs_confirmed !== false &&
    set.set_type !== "warm_up" &&
    (set.actual_reps ?? 0) > 0 &&
    set.logging_kind !== "duration" &&
    set.logging_kind !== "assisted" &&
    (set.load_mode === "bodyweight" || (set.actual_weight_kg ?? 0) > 0)
  );
}
export function movementProgress(
  items: readonly WorkoutItem[],
  required?: number | null,
) {
  const supported = items.filter(
    (i) => i.loggingKind !== "duration" && i.loggingKind !== "assisted",
  );
  const rows = supported.flatMap((i) => i.sets);
  const visible = rows.filter((set) => !set.deleted_at);
  const completed = rows.filter(qualifyingProgressSet).length;
  const intended = required != null && required > 0 ? required : null;
  const unresolved = visible.some(
    (set) => set.status !== "completed" || set.inputs_confirmed === false,
  );
  const adjustedRequired =
    intended !== null && rows.length !== visible.length && visible.length > 0
      ? Math.min(intended, visible.length)
      : intended;
  let status: MovementStatus;
  if (completed === 0) status = "Not Started";
  else if (unresolved) status = "In Progress";
  else if (adjustedRequired !== null)
    status = completed >= adjustedRequired ? "Complete" : "In Progress";
  else
    status =
      // Unprescribed ad-hoc entries use the persisted exercise status. Merely
      // opening it (or having no rows) never establishes completion.
      supported.length > 0 && supported.every((i) => i.status === "completed")
        ? "Complete"
        : "In Progress";
  return { completed, required: adjustedRequired, status };
}
export function workoutProgress(workout: Workout, items = workout.items) {
  const movements = (workout.movements ?? []).map((m) => ({
    id: m.id,
    movement: m,
    items: items.filter((i) => i.programMovementId === m.id),
    progress: movementProgress(
      items.filter((i) => i.programMovementId === m.id),
      m.workingSets,
    ),
  }));
  const extras = items
    .filter((i) => !i.programMovementId)
    .map((item) => ({
      id: item.id,
      movement: null,
      items: [item],
      progress: movementProgress([item], item.prescribedSets),
    }));
  return [...movements, ...extras];
}
