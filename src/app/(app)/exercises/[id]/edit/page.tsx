import { notFound } from "next/navigation";
import { loadLibrary } from "@/features/exercises/queries";
import { isUuid } from "@/features/exercises/validation";
import { ExerciseEditor } from "@/components/exercises/exercise-editor";
export const metadata = { title: "Edit exercise" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const library = await loadLibrary();
  const exercise = library.exercises.find(
    (e) => e.id === id && e.ownerId === library.userId,
  );
  if (!exercise) notFound();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">YOUR PRIVATE LIBRARY</p>
        <h1>Edit your exercise.</h1>
      </div>
      <ExerciseEditor library={library} exercise={exercise} />
    </>
  );
}
