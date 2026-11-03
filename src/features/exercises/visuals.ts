export type VisualInput = {
  slug: string;
  ownerId: string | null;
  patternSlug?: string;
};
export type ExerciseVisual = {
  src: string;
  kind: "exercise" | "movement" | "default";
  description: string;
};
export const specificVisualSlugs = [
  "barbell_bench_press",
  "barbell_back_squat",
  "conventional_deadlift",
  "pull_up",
  "push_up",
  "dumbbell_lateral_raise",
  "standing_dumbbell_curl",
  "forearm_plank",
] as const;
export const movementVisualSlugs = [
  "horizontal_push",
  "incline_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "shoulder_abduction",
  "shoulder_flexion",
  "horizontal_adduction",
  "horizontal_abduction",
  "shoulder_extension",
  "elbow_flexion",
  "elbow_extension",
  "squat",
  "hip_hinge",
  "hip_bridge",
  "lunge",
  "knee_extension",
  "knee_flexion",
  "calf_raise",
  "hip_abduction",
  "hip_adduction",
  "spinal_flexion",
  "anti_extension",
  "anti_rotation",
  "rotation",
  "lateral_core",
  "loaded_carry",
  "shrug",
  "functional",
] as const;
export function resolveExerciseVisuals(input: VisualInput): ExerciseVisual[] {
  const choices: ExerciseVisual[] = [];
  if (
    input.ownerId === null &&
    specificVisualSlugs.some((slug) => slug === input.slug)
  )
    choices.push({
      src: `/exercise-thumbnails/${input.slug}.svg`,
      kind: "exercise",
      description: `${input.slug.replaceAll("_", " ")} illustration`,
    });
  if (
    input.patternSlug &&
    movementVisualSlugs.some((slug) => slug === input.patternSlug)
  )
    choices.push({
      src: `/movement-patterns/${input.patternSlug}.svg`,
      kind: "movement",
      description: `Movement family: ${input.patternSlug.replaceAll("_", " ")}`,
    });
  choices.push({
    src: "/ui/exercise.svg",
    kind: "default",
    description: "General exercise illustration",
  });
  return choices;
}
