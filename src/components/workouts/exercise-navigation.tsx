import Link from "next/link";
import { ExerciseThumbnail } from "@/components/exercises/exercise-thumbnail";
import { loggerHref } from "@/features/workouts/navigation";
import type { WorkoutItem } from "@/features/workouts/types";
// Ad-hoc workouts have selected exercises rather than prescribed movement slots.
// This strip navigates those existing entries; it never substitutes identities.
export function ExerciseNavigation({
  workoutId,
  items,
  selectedId,
}: {
  workoutId: string;
  items: readonly WorkoutItem[];
  selectedId: string;
}) {
  return (
    <nav className="movement-carousel" aria-label="Workout exercises">
      {items.map((item) => (
        <Link
          className="movement-tile"
          key={item.id}
          href={loggerHref(workoutId, item.id)}
          aria-current={item.id === selectedId ? "page" : undefined}
        >
          <ExerciseThumbnail visual={item.visual} size={32} />
          <span className="movement-exercise-name">{item.name}</span>
          <span className="movement-tile-context">
            {item.id === selectedId ? "Selected" : "Open logger"}
          </span>
        </Link>
      ))}
    </nav>
  );
}
