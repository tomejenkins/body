import Link from "next/link";
import { randomUUID } from "node:crypto";
import { loadProgramAdherence } from "@/features/programs/progression-queries";
import { StartProgramWorkout } from "./start-program-workout";
export async function ProgramProgress({ session }: { session?: string }) {
  const p = await loadProgramAdherence(session);
  if (!p) return null;
  return (
    <section className="program-progress" aria-label="Program progress">
      <h2>{p.name}</h2>
      <p>
        {p.completedWorkouts} completed workouts · {p.completedRotations}{" "}
        complete rotations
      </p>
      <p>
        {p.completedMovements} prescribed movements completed ·{" "}
        {p.partialMovements} partially completed · {p.recentWorkouts} workouts
        in the last 30 days
      </p>
      {p.lastName && <p>Last completed: {p.lastName}</p>}
      {p.programComplete && (
        <p>Program complete · your recorded training is preserved.</p>
      )}
      <p>
        Next: Workout {p.nextNumber} of {p.trainingDays} · {p.nextName}
      </p>
      {p.activeSession ? (
        <p>
          In progress: {p.activeName} ·{" "}
          <Link href={`/workout/${p.activeSession}`}>Resume Workout</Link>
        </p>
      ) : (
        <StartProgramWorkout
          version={p.version}
          day={p.nextPosition}
          number={p.nextNumber}
          request={randomUUID()}
        />
      )}
      <details>
        <summary>How progress works</summary>
        <p>
          Rest days are recovery guidance, never missed workouts. Flexible
          rotations follow completed training, not calendar weekdays. A full
          rotation requires every training workout to be completed fully;
          partial work is retained. Starting a different program keeps previous
          history.
        </p>
      </details>
    </section>
  );
}
