import { notFound, redirect } from "next/navigation";
import { loadWorkout } from "@/features/workouts/queries";
import { loadLibrary } from "@/features/exercises/queries";
import { isUuid } from "@/features/exercises/validation";
import { WorkoutSelector } from "@/components/workouts/workout-selector";
export const metadata = { title: "Select exercises" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const workout = await loadWorkout(id);
  if (!workout) notFound();
  if (workout.status !== "in_progress") redirect(`/workout/${id}`);
  const library = await loadLibrary();
  return <WorkoutSelector workout={workout} library={library} />;
}
