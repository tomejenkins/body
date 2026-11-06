import { loadAchievements } from "@/features/records/queries";
import { Achievements } from "@/components/records/achievements";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import type { WeightUnit } from "@/features/sets/model";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  StartWorkout,
  StartBlankWorkout,
} from "@/components/workouts/workout-controls";
import { loadWorkout } from "@/features/workouts/queries";
export const metadata = { title: "Workout" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const active = await loadWorkout();
  const achievements =
    params.message === "completed"
      ? await loadAchievements(params.finished)
      : [];
  let unit: WeightUnit = "lb";
  if (achievements.length) {
    const user = await requireUser("/workout");
    const client = await createClient({ readOnly: true });
    const pref = await client
      .from("account_preferences")
      .select("display_weight_unit")
      .eq("owner_id", user.id)
      .single<{ display_weight_unit: WeightUnit }>();
    if (pref.error) throw new Error("Weight preference could not be loaded.");
    unit = pref.data.display_weight_unit;
  }
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">TRAIN WITH INTENTION</p>
        <h1>Workout</h1>
        <p className="intro">Choose a focus or start blank.</p>
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
      <Achievements achievements={achievements} unit={unit} />
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
            : "Choose your exercises and record your sets at your own pace."}
        </p>
        {active ? (
          <Button asChild>
            <Link href={`/workout/${active.id}`}>Resume Workout</Link>
          </Button>
        ) : (
          <div className="entry-actions">
            <StartWorkout />
            <StartBlankWorkout />
          </div>
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
