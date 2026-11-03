import Link from "next/link";
import { loadLibrary } from "@/features/exercises/queries";
import { ExerciseSelector } from "@/components/exercises/exercise-selector";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Exercise library" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const library = await loadLibrary();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">MOVE WITH INTENTION</p>
        <h1>Find your movement.</h1>
        <p className="intro">
          A considered library. A stronger starting point.
        </p>
        <div className="library-heading-actions">
          <Link href="/workout">← Workout</Link>
          <Button asChild variant="outline">
            <Link href="/exercises/new">Create custom exercise</Link>
          </Button>
        </div>
      </div>
      {params.message === "archived" && (
        <p role="status" className="auth-success">
          Exercise archived. Workout history is preserved.
        </p>
      )}
      <ExerciseSelector library={library} />
    </>
  );
}
