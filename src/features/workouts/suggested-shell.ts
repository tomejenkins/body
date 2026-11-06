import { specialMeasurement } from "@/features/history/measurement";
import type { Exercise, ExerciseType, Taxon } from "@/features/exercises/types";
export type SuggestedMovement = {
  pattern: string;
  muscle: string;
  exerciseType: ExerciseType;
  title: string;
  sets: number;
  repsMin: number;
  repsMax: number;
};
const priorities: Record<string, string[]> = {
  pectorals: ["horizontal_push", "incline_push", "horizontal_adduction"],
  triceps: ["elbow_extension", "horizontal_push"],
  lats: ["vertical_pull", "horizontal_pull", "shoulder_extension"],
  upper_back: ["horizontal_pull"],
  quadriceps: ["squat", "lunge", "knee_extension"],
  hamstrings: ["hip_hinge", "knee_flexion"],
  glutes: ["hip_bridge", "lunge", "hip_hinge"],
  anterior_deltoids: ["vertical_push", "shoulder_flexion"],
  lateral_deltoids: ["shoulder_abduction", "vertical_push"],
  posterior_deltoids: ["horizontal_abduction", "horizontal_pull"],
  trapezius: ["shrug", "loaded_carry"],
  abdominals: ["spinal_flexion", "anti_rotation", "anti_extension"],
  obliques: ["rotation", "anti_rotation", "lateral_core"],
  biceps: ["elbow_flexion"],
  calves: ["calf_raise"],
  hip_abductors: ["hip_abduction"],
  hip_adductors: ["hip_adduction"],
  forearms: ["loaded_carry"],
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
// A lightweight, deterministic taxonomy recipe, not a personalized programme.
// Distinct primary patterns take priority; missing patterns never get filler.
export function suggestedShell(
  primary: string,
  secondary: string,
  exercises: readonly Exercise[],
  patterns: readonly Taxon[],
  muscles: readonly Taxon[],
): SuggestedMovement[] {
  if (!muscles.some((m) => m.id === primary))
    throw Error("Choose a primary muscle group.");
  if (
    secondary &&
    (!muscles.some((m) => m.id === secondary) || secondary === primary)
  )
    throw Error("Choose two different muscle groups.");
  return [primary, ...(secondary ? [secondary] : [])].flatMap((muscle) => {
    const taxon = muscles.find((m) => m.id === muscle)!;
    const available = exercises.filter(
      (e) =>
        !e.archivedAt &&
        !specialMeasurement(e.id) &&
        e.primaryMuscleIds.includes(muscle) &&
        e.exerciseType !== "other",
    );
    const ranked = patterns
      .filter((p) => available.some((e) => e.primaryPatternId === p.id))
      .sort((a, b) => {
        const order = priorities[taxon.slug] ?? [];
        const rank = (slug: string) =>
          order.includes(slug) ? order.indexOf(slug) : 100;
        return rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug);
      });
    return ranked.slice(0, 2).map((pattern) => {
      const choices = available.filter(
        (e) => e.primaryPatternId === pattern.id,
      );
      const exerciseType: ExerciseType = choices.some(
        (e) => e.exerciseType === "compound",
      )
        ? "compound"
        : "isolation";
      return {
        pattern: pattern.id,
        muscle,
        exerciseType,
        title:
          taxon.slug === "triceps" && pattern.slug === "horizontal_push"
            ? "Close-Grip Press"
            : (titles[pattern.slug] ?? pattern.name),
        sets: 3,
        repsMin: exerciseType === "compound" ? 8 : 10,
        repsMax: exerciseType === "compound" ? 12 : 15,
      };
    });
  });
}

export function movementKey(s: SuggestedMovement) {
  return `${s.muscle}:${s.pattern}:${s.exerciseType}`;
}
export function allMovementOptions(l: {
  exercises: readonly Exercise[];
  patterns: readonly Taxon[];
  muscles: readonly Taxon[];
}): SuggestedMovement[] {
  return l.muscles.flatMap((m) =>
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
}
