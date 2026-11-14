import { SavedFavorites } from "@/components/entitlements/saved-favorites";
import { readAccess } from "@/features/entitlements/server";
import { AccessStatus } from "@/components/entitlements/access-status";
import { WorkoutSelection } from "@/components/workouts/workout-selection";
import { redirect } from "next/navigation";
import { isUuid } from "@/features/exercises/validation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadWorkout } from "@/features/workouts/queries";
export const metadata = { title: "Workout" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (
    params.message === "completed" &&
    typeof params.finished === "string" &&
    isUuid(params.finished)
  )
    redirect(`/workout/${params.finished}/complete`);
  const active = await loadWorkout();
  const access = await readAccess();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">TRAIN WITH INTENTION</p>
        <h1>Workout</h1>
      </div>
      {params.message === "abandoned" && (
        <p role="status" className="auth-success">
          Workout abandoned. Its record is preserved.
        </p>
      )}
      {active && (
        <section className="workout-entry">
          <span className="eyebrow">IN PROGRESS</span>
          <h2>Pick up where you left off.</h2>
          <Button asChild>
            <Link href={`/workout/${active.id}`}>Resume Workout</Link>
          </Button>
        </section>
      )}
      {access.status === "ready" && access.decision.allowed ? (
        <WorkoutSelection
          activeSession={active?.id}
          showAlternatives={params.choices === "program"}
          showDecisions={params.decisions === "program"}
        />
      ) : (
        <>
          <AccessStatus result={access} />
          {access.status === "ready" ? <SavedFavorites /> : null}
        </>
      )}
      <div className="library-section">
        <Button variant="outline" asChild>
          <Link href="/exercises">Explore exercise library</Link>
        </Button>
      </div>
    </>
  );
}
