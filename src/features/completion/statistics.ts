import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
export type TrainingSummary = {
  session_id: string;
  working_sets: number;
  exercises_performed: number;
};
export async function loadTrainingSummary(
  id: string,
): Promise<TrainingSummary> {
  await requireUser(`/workout/${id}/complete`);
  const client = await createClient({ readOnly: true });
  const result = await client.rpc("workout_training_summary", {
    p_sessions: [id],
  });
  if (result.error || !result.data?.length)
    throw Error("Workout statistics could not be loaded. Please retry.");
  return result.data[0] as TrainingSummary;
}
