import { createClient } from "@/lib/supabase/server";
import { specialMeasurement } from "@/features/history/measurement";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadWorkout } from "@/features/workouts/queries";
import { loadLibrary } from "@/features/exercises/queries";
import { workoutSetupOptions } from "@/features/workouts/suggested-shell";
import { WorkoutSetup } from "@/components/workouts/workout-setup";
export const metadata = { title: "Start a workout" };
export default async function Page() {
  const active = await loadWorkout();
  if (active) redirect(`/workout/${active.id}`);
  const l = await loadLibrary();
  const setup = workoutSetupOptions(l);
  const client = await createClient({ readOnly: true });
  const recent = await client.rpc("workout_setup_recents");
  if (recent.error) throw Error("Recent exercises could not be loaded.");
  return (
    <>
      <header className="page-heading workout-setup-heading">
        <Link href="/workout">← Back to Workout</Link>
        <h1>What are we training today?</h1>
      </header>
      <WorkoutSetup
        exercises={l.exercises
          .filter(
            (e) =>
              !e.archivedAt &&
              !specialMeasurement(e.id) &&
              !!e.primaryPatternId &&
              !!e.primaryMuscleIds.length,
          )
          .map(({ id, name }) => ({ id, name }))
          .sort(
            (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
          )}
        recentIds={(recent.data as { exercise_id: string }[]).map(
          (e) => e.exercise_id,
        )}
        exerciseRequest={crypto.randomUUID()}
        focuses={setup.focuses}
        counts={setup.counts}
        request={crypto.randomUUID()}
      />
    </>
  );
}
