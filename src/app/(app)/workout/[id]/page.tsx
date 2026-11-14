import { readAccess } from "@/features/entitlements/server";
import { trainingAllowed } from "@/features/entitlements/model";
import { AccessStatus } from "@/components/entitlements/access-status";
import { loadProgressionSuggestions } from "@/features/programs/progression-queries";
import { loadWorkoutMovements } from "@/features/programs/execution-queries";
import { WorkoutReview } from "@/components/history/workout-review";
import { notFound } from "next/navigation";
import { loadWorkout } from "@/features/workouts/queries";
import { isUuid } from "@/features/exercises/validation";
import { WorkoutLogger } from "@/components/sets/workout-logger";
export const metadata = { title: "Your workout" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    exercise?: string | string[];
    group?: string | string[];
  }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const workout = await loadWorkout(id);
  if (!workout) notFound();
  if (workout.status !== "in_progress")
    return <WorkoutReview workout={workout} />;
  const [selection, loadSuggestions] = await Promise.all([
    loadWorkoutMovements(workout),
    loadProgressionSuggestions(workout),
  ]);
  const access = await readAccess(id);
  const query = await searchParams;
  const focusedItemId =
    typeof query.exercise === "string" &&
    workout.items.some((i) => i.id === query.exercise)
      ? query.exercise
      : undefined;
  return (
    <>
      {!trainingAllowed(access) ||
      (access.status === "ready" && !access.decision.allowed) ? (
        <AccessStatus result={access} />
      ) : null}
      <WorkoutLogger
        trainingAccess={trainingAllowed(access)}
        key={workout.id}
        focusedItemId={focusedItemId}
        focusedGroupId={
          typeof query.group === "string" &&
          workout.groups?.some((g) => g.id === query.group)
            ? query.group
            : undefined
        }
        workout={{
          ...workout,
          loadSuggestions,
          movements: selection.movements,
          movementFacets: selection.facets,
          movementOptions: selection.movementOptions,
        }}
      />
    </>
  );
}
