import type { WorkoutItem, WorkoutStatus } from "./types";
export function canTransition(from: WorkoutStatus, to: WorkoutStatus) {
  return from === "in_progress" && (to === "completed" || to === "abandoned");
}
export function orderedItems(items: readonly WorkoutItem[]) {
  return [...items].sort(
    (a, b) =>
      a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
export function adjacentItem(
  items: readonly WorkoutItem[],
  id: string,
  direction: -1 | 1,
) {
  const ordered = orderedItems(items);
  const index = ordered.findIndex((item) => item.id === id);
  return index >= 0 ? ordered[index + direction] : undefined;
}
export function describeStatus(status: WorkoutStatus) {
  return status === "in_progress"
    ? "In progress"
    : status === "completed"
      ? "Finished"
      : "Abandoned";
}
