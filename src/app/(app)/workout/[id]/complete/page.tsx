import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/features/exercises/validation";
import { loadWorkout } from "@/features/workouts/queries";
import { loadCompletion } from "@/features/completion/queries";
import { WorkoutComplete } from "@/components/completion/workout-complete";
export const metadata = { title: "Workout Complete" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ achievements?: string | string[] }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const workout = await loadWorkout(id);
  if (!workout) notFound();
  if (workout.status === "in_progress") redirect(`/workout/${id}`);
  if (workout.status !== "completed") redirect(`/history/${id}`);
  const summary = await loadCompletion(workout);
  return (
    <WorkoutComplete
      workout={workout}
      summary={summary}
      showAllAchievements={(await searchParams).achievements === "all"}
    />
  );
}
