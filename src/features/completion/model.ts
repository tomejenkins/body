import { qualifiedDuration } from "@/features/continuity/model";
import { durationLabel } from "@/features/history/model";
import type { Workout } from "@/features/workouts/types";
export function completionDuration(w: Workout) {
  const text = w.continuity
    ? qualifiedDuration(w.continuity)
    : (() => {
        const value = durationLabel(w.startedAt, w.finishedAt);
        return value
          ? `Elapsed session (legacy): ${value}`
          : "Duration unavailable";
      })();
  const separator = text.indexOf(": ");
  return separator < 0
    ? { label: "Duration", value: "Unavailable", detail: text }
    : {
        label: text.slice(0, separator),
        value: text.slice(separator + 2).split(" · ")[0],
        detail: text,
      };
}
export function favoriteSource(w: Workout) {
  if (
    w.hasGroupHistory &&
    (w.sourceVersionId || (w.favoriteId && w.favoriteGroupingEdited))
  )
    return { type: "completed_workout" as const, source: w.id, key: w.id };
  return w.sourceVersionId && w.sourceDayId
    ? {
        type: "program_day" as const,
        source: w.sourceVersionId,
        day: w.sourceDayId,
        key: `${w.sourceVersionId}:${w.sourceDayId}`,
      }
    : { type: "completed_ad_hoc" as const, source: w.id, key: w.id };
}
