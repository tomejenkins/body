import Link from "next/link";
import { notFound } from "next/navigation";
import { loadLibrary } from "@/features/exercises/queries";
import { isUuid } from "@/features/exercises/validation";
import {
  FavoriteButton,
  PreferenceControl,
  ArchiveControl,
} from "@/components/exercises/preference-controls";
export const metadata = { title: "Exercise details" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const library = await loadLibrary();
  const exercise = library.exercises.find((e) => e.id === id);
  if (!exercise) notFound();
  const names = (ids: string[], items: typeof library.patterns) =>
    ids
      .map((id) => items.find((t) => t.id === id)?.name ?? "Unclassified")
      .join(" · ") || "None";
  const preference = library.preferences.find((p) => p.exerciseId === id);
  return (
    <>
      <div className="page-heading">
        <Link href="/exercises">← Exercise library</Link>
        <p className="eyebrow">
          {exercise.ownerId
            ? "PRIVATE CUSTOM EXERCISE"
            : "BODY EXERCISE LIBRARY"}
        </p>
        <h1>{exercise.name}</h1>
        <FavoriteButton
          exercise={exercise}
          favorite={preference?.isFavorite ?? false}
        />
      </div>
      <dl className="exercise-detail">
        <dt>Exercise type</dt>
        <dd className="capitalize">{exercise.exerciseType}</dd>
        <dt>Primary movement</dt>
        <dd>
          {exercise.primaryPatternId
            ? names([exercise.primaryPatternId], library.patterns)
            : "Not yet classified"}
        </dd>
        <dt>Secondary movements</dt>
        <dd>{names(exercise.secondaryPatternIds, library.patterns)}</dd>
        <dt>Primary muscles</dt>
        <dd>{names(exercise.primaryMuscleIds, library.muscles)}</dd>
        <dt>Secondary muscles</dt>
        <dd>{names(exercise.secondaryMuscleIds, library.muscles)}</dd>
        <dt>Required equipment</dt>
        <dd>{names(exercise.equipmentIds, library.equipment)}</dd>
      </dl>
      <section className="library-section">
        <h2>Movement notes</h2>
        <p className="exercise-instructions">
          {exercise.instructions ||
            "No instructions added. Choose a comfortable range and seek qualified guidance for unfamiliar movements."}
        </p>
      </section>
      <PreferenceControl
        exerciseId={id}
        preference={preference?.preference ?? "neutral"}
      />
      {exercise.ownerId === library.userId && (
        <>
          <div className="library-section">
            <Link href={`/exercises/${id}/edit`}>Edit custom exercise</Link>
          </div>
          <ArchiveControl id={id} />
        </>
      )}
    </>
  );
}
