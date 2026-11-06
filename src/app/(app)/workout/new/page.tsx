import Link from "next/link";
import { redirect } from "next/navigation";
import { loadWorkout } from "@/features/workouts/queries";
import { loadLibrary } from "@/features/exercises/queries";
import { suggestedShell } from "@/features/workouts/suggested-shell";
import { WorkoutSetup } from "@/components/workouts/workout-setup";
export const metadata = { title: "Start a workout" };
export default async function Page() {
  const active = await loadWorkout();
  if (active) redirect(`/workout/${active.id}`);
  const l = await loadLibrary();
  const counts = Object.fromEntries(
    l.muscles.map((m) => [
      m.id,
      suggestedShell(m.id, "", l.exercises, l.patterns, l.muscles).length,
    ]),
  );
  return (
    <>
      <header className="page-heading">
        <Link href="/workout">← Workout</Link>
        <h1>What are we training?</h1>
      </header>
      <WorkoutSetup
        muscles={l.muscles}
        counts={counts}
        request={crypto.randomUUID()}
      />
    </>
  );
}
