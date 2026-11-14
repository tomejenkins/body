import { readAccess } from "@/features/entitlements/server";
import { trainingAllowed } from "@/features/entitlements/model";
import { AccessStatus } from "@/components/entitlements/access-status";
import {
  parseBuilderFilters,
  queryParams,
  type QueryValues,
} from "@/features/workouts/navigation";
import { notFound, redirect } from "next/navigation";
import { loadWorkout } from "@/features/workouts/queries";
import { loadLibrary } from "@/features/exercises/queries";
import { isUuid } from "@/features/exercises/validation";
import { WorkoutSelector } from "@/components/workouts/workout-selector";
export const metadata = { title: "Select exercises" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<QueryValues>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const workout = await loadWorkout(id);
  if (!workout) notFound();
  if (workout.status !== "in_progress") redirect(`/workout/${id}`);
  const access = await readAccess(id);
  if (!trainingAllowed(access)) return <AccessStatus result={access} />;
  const library = await loadLibrary();
  const query = await searchParams;
  const selectedAdded =
    typeof query.added === "string" &&
    workout.items.some((i) => i.exerciseId === query.added);
  return (
    <WorkoutSelector
      workout={workout}
      library={library}
      initialFilters={
        query.view === "1" ? parseBuilderFilters(queryParams(query)) : undefined
      }
      added={selectedAdded}
    />
  );
}
