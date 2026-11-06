import {
  movementIntents,
  supportsIntent,
} from "@/features/exercises/movement-intents";
import { focusById, quickFocus } from "./quick-focus";
import { specialMeasurement } from "@/features/history/measurement";
import type { Exercise, ExerciseType, Taxon } from "@/features/exercises/types";
export type SuggestedMovement = {
  intent?: string;
  pattern: string;
  muscle: string;
  exerciseType: ExerciseType;
  title: string;
  sets: number;
  repsMin: number;
  repsMax: number;
};
const titles: Record<string, string> = {
  horizontal_push: "Flat Chest Press",
  incline_push: "Incline Chest Press",
  horizontal_adduction: "Chest Fly",
  elbow_extension: "Triceps Extension",
  vertical_pull: "Vertical Pull",
  horizontal_pull: "Row",
  squat: "Squat",
  lunge: "Single-Leg Movement",
  hip_hinge: "Hip Hinge",
  knee_extension: "Leg Extension",
  knee_flexion: "Leg Curl",
  hip_bridge: "Hip Thrust",
  vertical_push: "Overhead Press",
  elbow_flexion: "Biceps Curl",
  calf_raise: "Calf Raise",
};
export function muscleLabel(m: Taxon) {
  return (
    (
      {
        pectorals: "Chest",
        lats: "Lats / Back",
        quadriceps: "Quadriceps",
        hamstrings: "Hamstrings",
      } as Record<string, string>
    )[m.slug] ?? m.name
  );
}
// Ordered recipes select supported intent, never actual exercises/performance.
// Emphasis is primary-only; balanced complements fill gaps in catalog coverage.
export function suggestedShell(
  primary: string,
  secondary: string,
  exercises: readonly Exercise[],
  patterns: readonly Taxon[],
  muscles: readonly Taxon[],
  emphasis = "balanced",
): SuggestedMovement[] {
  const focus = focusById(primary),
    other = secondary ? focusById(secondary) : undefined;
  if (!focus) throw Error("Choose a primary focus.");
  if (secondary && (!other || secondary === primary))
    throw Error("Choose two different focus groups.");
  if (emphasis !== "balanced" && !focus.emphasis.some((e) => e.id === emphasis))
    throw Error("Choose a supported emphasis.");
  const options = intentMovementOptions({ exercises, patterns, muscles });
  const selected: SuggestedMovement[] = [];
  const add = (group: typeof focus, count: number, emphasisId = "balanced") => {
    const order = [
      ...(group.emphasis.find((e) => e.id === emphasisId)?.intents ?? []),
      ...group.balanced,
    ];
    let added = 0;
    for (const key of new Set(order)) {
      if (added >= count) break;
      const option = options.find((s) => s.intent === key);
      if (option && !selected.some((s) => s.intent === key)) {
        selected.push(option);
        added++;
      }
    }
  };
  add(
    focus,
    other ? (focus.count === 3 && other.count === 3 ? 2 : 3) : focus.count,
    emphasis,
  );
  if (other) add(other, 2);
  return selected.slice(0, 6);
}
export function intentMovementOptions(l: {
  exercises: readonly Exercise[];
  patterns: readonly Taxon[];
  muscles: readonly Taxon[];
}): SuggestedMovement[] {
  return movementIntents
    .filter((intent) =>
      l.exercises.some(
        (e) =>
          !specialMeasurement(e.id) &&
          supportsIntent(e, intent, l.patterns, l.muscles),
      ),
    )
    .map((intent) => ({
      intent: intent.key,
      pattern: intent.patternId,
      muscle: intent.muscleId,
      exerciseType: intent.exerciseType,
      title: intent.title,
      sets: 3,
      repsMin: intent.exerciseType === "compound" ? 8 : 10,
      repsMax: intent.exerciseType === "compound" ? 12 : 15,
    }));
}
export type SetupFocus = {
  id: string;
  label: string;
  emphasis: { id: string; label: string }[];
};
export function workoutSetupOptions(l: {
  exercises: readonly Exercise[];
  patterns: readonly Taxon[];
  muscles: readonly Taxon[];
}) {
  const counts: Record<string, number> = {};
  const supported = new Set(intentMovementOptions(l).map((s) => s.intent));
  const signature = (primary: string, emphasis: string) =>
    suggestedShell(primary, "", l.exercises, l.patterns, l.muscles, emphasis)
      .map(movementKey)
      .join("|");
  const focuses: SetupFocus[] = quickFocus.map((focus) => ({
    id: focus.id,
    label: focus.label,
    emphasis: focus.emphasis
      .filter(
        (e) =>
          e.supportedBy.some((key) => supported.has(key)) &&
          signature(focus.id, e.id) !== signature(focus.id, "balanced"),
      )
      .map(({ id, label }) => ({ id, label })),
  }));
  for (const focus of focuses)
    for (const secondary of [
      "",
      ...focuses.filter((f) => f.id !== focus.id).map((f) => f.id),
    ])
      for (const emphasis of ["balanced", ...focus.emphasis.map((e) => e.id)])
        counts[`${focus.id}:${secondary}:${emphasis}`] = suggestedShell(
          focus.id,
          secondary,
          l.exercises,
          l.patterns,
          l.muscles,
          emphasis,
        ).length;
  return { focuses, counts };
}

export function movementKey(s: SuggestedMovement) {
  return `${s.muscle}:${s.pattern}:${s.exerciseType}${s.intent ? ":" + s.intent : ""}`;
}
export function allMovementOptions(l: {
  exercises: readonly Exercise[];
  patterns: readonly Taxon[];
  muscles: readonly Taxon[];
}): SuggestedMovement[] {
  const broad = l.muscles.flatMap((m) =>
    l.patterns.flatMap((p) => {
      const types = ["compound", "isolation"] as const;
      return types
        .filter((t) =>
          l.exercises.some(
            (e) =>
              !e.archivedAt &&
              !specialMeasurement(e.id) &&
              e.exerciseType === t &&
              e.primaryMuscleIds.includes(m.id) &&
              e.primaryPatternId === p.id,
          ),
        )
        .map((t) => ({
          pattern: p.id,
          muscle: m.id,
          exerciseType: t,
          title: `${muscleLabel(m)} · ${m.slug === "triceps" && p.slug === "horizontal_push" ? "Close-Grip Press" : (titles[p.slug] ?? p.name)}`,
          sets: 3,
          repsMin: t === "compound" ? 8 : 10,
          repsMax: t === "compound" ? 12 : 15,
        }));
    }),
  );
  return [...intentMovementOptions(l), ...broad];
}
