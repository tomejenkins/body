import type { SelectionCandidate, MovementTarget } from "./selection";
import type { VisualInput } from "@/features/exercises/visuals";
import type { Taxon } from "@/features/exercises/types";
export type MovementTile = Pick<
  SelectionCandidate,
  "level" | "labels" | "equipmentAvailable"
> & { id: string; name: string; visual: VisualInput; supported: boolean };
export type WorkoutMovement = {
  id: string;
  position: number;
  label: string;
  target: MovementTarget;
  targetSets: number;
  workingSets: number;
  currentItemId: string | null;
  currentExerciseId: string | null;
  candidates: MovementTile[];
};
export type MovementFacets = { patterns: Taxon[]; muscles: Taxon[] };
export type SelectionResult = {
  error?: string;
  needsContinuation?: boolean;
  conflict?: boolean;
  itemId?: string;
};
export type MovementSearch = {
  query: string;
  type: string;
  pattern: string;
  muscle: string;
  equipmentOnly: boolean;
  page: number;
};
