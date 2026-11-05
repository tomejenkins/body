import type { LoggedSet, WeightUnit } from "@/features/sets/model";
import type { VisualInput } from "@/features/exercises/visuals";
export type WorkoutStatus = "in_progress" | "completed" | "abandoned";
export type WorkoutItem = {
  id: string;
  exerciseId: string;
  name: string;
  position: number;
  visual: VisualInput;
  canRemove: boolean;
  bodyweightEligible: boolean;
  loggingKind?: import("@/features/history/model").LoggingKind;
  exerciseType: string;
  sets: LoggedSet[];
  prescribedSets?: number | null;
};
export type Workout = {
  id: string;
  name: string;
  status: WorkoutStatus;
  completionStatus: "none" | "partial" | "full";
  startedAt: string;
  finishedAt: string | null;
  items: WorkoutItem[];
  userId: string;
  weightUnit: WeightUnit;
  preferredEffortScale?: import("@/features/sets/effort").EffortScale;
  continuity?: import("@/features/continuity/model").Continuity | null;
};
export type WorkoutState = {
  error?: string;
  success?: string;
  itemId?: string;
};
