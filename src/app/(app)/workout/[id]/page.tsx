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
  searchParams: Promise<{ exercise?: string | string[] }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const workout = await loadWorkout(id);
  if (!workout) notFound();
  if (workout.status !== "in_progress")
    return <WorkoutReview workout={workout} />;
  const selection = await loadWorkoutMovements(workout);
  const query = await searchParams;
  const focusedItemId =
    typeof query.exercise === "string" &&
    workout.items.some((i) => i.id === query.exercise)
      ? query.exercise
      : undefined;
  return (
    <WorkoutLogger
      key={workout.id}
      focusedItemId={focusedItemId}
      workout={{
        ...workout,
        movements: selection.movements,
        movementFacets: selection.facets,
        movementOptions: selection.movementOptions,
      }}
    />
  );
}
