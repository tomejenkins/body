import { readAccess } from "@/features/entitlements/server";
import { trainingAllowed } from "@/features/entitlements/model";
import { loadWorkoutContext } from "@/features/workouts/context";
import {
  builderHref,
  loggerHref,
  exerciseHref,
  contextFilters,
  type QueryValues,
} from "@/features/workouts/navigation";
import { AddFromDetails } from "@/components/workouts/add-from-details";
import { ExerciseThumbnail } from "@/components/exercises/exercise-thumbnail";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<QueryValues>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const context = await loadWorkoutContext(
    query.workoutId,
    id,
    query.workoutItemId,
  );
  const canTrain =
    context?.status === "in_progress" &&
    trainingAllowed(await readAccess(context.id));
  const filters = contextFilters(query.builder);
  const library = await loadLibrary(id);
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
        {context ? (
          <Link
            href={
              context.loggerItemId
                ? loggerHref(context.id, context.loggerItemId)
                : context.status === "in_progress"
                  ? builderHref(context.id, filters)
                  : `/workout/${context.id}`
            }
          >
            {context.loggerItemId
              ? "← Back to Exercise Logger"
              : context.status === "in_progress"
                ? "← Back to Workout Builder"
                : "← Back to Workout"}
          </Link>
        ) : (
          <Link href="/exercises">← Exercise library</Link>
        )}
        <p className="exercise-origin">
          {exercise.ownerId
            ? "PRIVATE CUSTOM EXERCISE"
            : "BODY EXERCISE LIBRARY"}
        </p>
        <ExerciseThumbnail
          size={128}
          decorative={false}
          visual={{
            slug: exercise.slug,
            ownerId: exercise.ownerId,
            patternSlug: library.patterns.find(
              (p) => p.id === exercise.primaryPatternId,
            )?.slug,
          }}
        />
        <h1>{exercise.name}</h1>
        {exercise.archivedAt ? (
          <p>Archived · Read only</p>
        ) : (
          <FavoriteButton
            exercise={exercise}
            favorite={preference?.isFavorite ?? false}
          />
        )}
      </div>
      {canTrain &&
        context &&
        (!exercise.archivedAt || context.alreadyAdded) && (
          <AddFromDetails
            workoutId={context.id}
            exerciseId={id}
            alreadyAdded={context.alreadyAdded}
            filters={filters}
          />
        )}
      {context && context.status !== "in_progress" && (
        <p role="status">
          This workout is closed. Exercises can no longer be added.
        </p>
      )}
      <div className="library-section">
        <Link
          href={exerciseHref(
            id,
            context?.id,
            filters,
            true,
            context?.loggerItemId,
          )}
        >
          Look Back
        </Link>
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
      {!exercise.archivedAt && (
        <PreferenceControl
          exerciseId={id}
          preference={preference?.preference ?? "neutral"}
        />
      )}
      {exercise.ownerId === library.userId && !exercise.archivedAt && (
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
