import { notFound } from "next/navigation";
import { isUuid } from "@/features/exercises/validation";
import { loadWorkout } from "@/features/workouts/queries";
import { WorkoutReview } from "@/components/history/workout-review";
export const metadata = { title: "Workout history" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const workout = await loadWorkout(id);
  if (!workout) notFound();
  return <WorkoutReview workout={workout} />;
}
