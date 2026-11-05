import { loadWorkoutMovements } from "@/features/programs/execution-queries";
import { WorkoutReview } from "@/components/history/workout-review";
import { notFound } from "next/navigation";
import { loadWorkout } from "@/features/workouts/queries";
import { isUuid } from "@/features/exercises/validation";
import { WorkoutLogger } from "@/components/sets/workout-logger";
export const metadata = { title: "Your workout" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const workout = await loadWorkout(id);
  if (!workout) notFound();
  if (workout.status !== "in_progress")
    return <WorkoutReview workout={workout} />;
  const selection = await loadWorkoutMovements(workout);
  return (
    <WorkoutLogger
      key={workout.id}
      workout={{
        ...workout,
        movements: selection.movements,
        movementFacets: selection.facets,
      }}
    />
  );
}
