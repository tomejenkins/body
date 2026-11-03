export const exerciseTypes = ["compound", "isolation", "other"] as const;
export type ExerciseType = (typeof exerciseTypes)[number];
export type Taxon = { id: string; slug: string; name: string };
export type Exercise = {
  id: string;
  slug: string;
  name: string;
  ownerId: string | null;
  exerciseType: ExerciseType;
  instructions: string | null;
  archivedAt: string | null;
  primaryPatternId: string | null;
  secondaryPatternIds: string[];
  primaryMuscleIds: string[];
  secondaryMuscleIds: string[];
  equipmentIds: string[];
};
export type Preference = {
  exerciseId: string;
  isFavorite: boolean;
  preference: "neutral" | "preferred" | "avoid";
};
export type Library = {
  exercises: Exercise[];
  patterns: Taxon[];
  muscles: Taxon[];
  equipment: Taxon[];
  preferences: Preference[];
  recentIds: string[];
  availableEquipmentIds: string[];
  userId: string;
};
export type ExerciseFilters = {
  query?: string;
  patternId?: string;
  muscleId?: string;
  exerciseType?: ExerciseType;
  availableEquipmentIds?: readonly string[];
  favoritesOnly?: boolean;
  customOnly?: boolean;
};
export type MutationState = { error?: string; success?: string; id?: string };
