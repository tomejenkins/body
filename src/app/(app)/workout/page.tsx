import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StartWorkout } from "@/components/workouts/workout-controls";
import { loadWorkout } from "@/features/workouts/queries";
export const metadata = { title: "Workout" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const active = await loadWorkout();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">TRAIN WITH INTENTION</p>
        <h1>Your next rep starts here.</h1>
        <p className="intro">A little preparation. A clear place to begin.</p>
      </div>
      {params.message === "completed" && (
        <p role="status" className="auth-success">
          Workout finished. Your selections are saved.
        </p>
      )}
      {params.message === "abandoned" && (
        <p role="status" className="auth-success">
          Workout abandoned. Its record is preserved.
        </p>
      )}
      <section className="workout-entry">
        <span className="eyebrow">
          {active ? "IN PROGRESS" : "YOUR TRAINING SPACE"}
        </span>
        <h2>
          {active
            ? "Pick up where you left off."
            : "Make a little room for movement."}
        </h2>
        <p>
          {active
            ? `${active.items.length} exercises selected. Resume your current workout whenever you’re ready.`
            : "Start an ad-hoc workout and choose your exercises. Set-by-set logging is coming next."}
        </p>
        {active ? (
          <Button asChild>
            <Link href={`/workout/${active.id}`}>Resume workout</Link>
          </Button>
        ) : (
          <StartWorkout />
        )}
      </section>
      <div className="library-section">
        <Button variant="outline" asChild>
          <Link href="/exercises">Explore exercise library</Link>
        </Button>
      </div>
    </>
  );
}
