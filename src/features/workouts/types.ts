import type { LoggedSet, WeightUnit } from "@/features/sets/model";
import type { VisualInput } from "@/features/exercises/visuals";
export type WorkoutStatus = "in_progress" | "completed" | "abandoned";
export type WorkoutItem = {
  id: string;
  programMovementId?: string | null;
  exerciseId: string;
  name: string;
  position: number;
  visual: VisualInput;
  canRemove: boolean;
  status?: "pending" | "partial" | "completed" | "skipped";
  instructions?: string | null;
  bodyweightEligible: boolean;
  loggingKind?: import("@/features/history/model").LoggingKind;
  exerciseType: string;
  sets: LoggedSet[];
  prescribedSets?: number | null;
};
export type Workout = {
  archivedAt?: string | null;
  retentionRevision?: number;
  favoriteId?: string | null;
  sourceVersionId?: string | null;
  sourceDayId?: string | null;
  favoriteAttribution?: {
    favorite?: string;
    program?: string;
    day?: string;
    workout?: string;
  } | null;
  id: string;
  isProgram?: boolean;
  loadSuggestions?: Record<
    string,
    import("@/features/programs/progression").LoadSuggestion
  >;
  movementOptions?: import("./suggested-shell").SuggestedMovement[];
  name: string;
  status: WorkoutStatus;
  completionStatus: "none" | "partial" | "full";
  startedAt: string;
  finishedAt: string | null;
  items: WorkoutItem[];
  movements?: import("@/features/programs/execution-types").WorkoutMovement[];
  movementFacets?: import("@/features/programs/execution-types").MovementFacets;
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
