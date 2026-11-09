import type { WorkoutItem } from "@/features/workouts/types";
import type { LoadSuggestion } from "./progression";
export function progressionFeedback(
  items: readonly Pick<WorkoutItem, "id" | "name" | "position">[],
  suggestions: Record<string, LoadSuggestion>,
) {
  return items
    .filter((i) => suggestions[i.id])
    .toSorted(
      (a, b) =>
        ({ increase: 0, reps: 1, estimate: 2, hold: 3 })[
          suggestions[a.id].action
        ] -
          { increase: 0, reps: 1, estimate: 2, hold: 3 }[
            suggestions[b.id].action
          ] || a.position - b.position,
    )
    .slice(0, 3)
    .map((i) => ({ id: i.id, name: i.name, suggestion: suggestions[i.id] }));
}
