import "server-only";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { validateProgression, type ProgressionRule } from "./model";
import {
  startingLoad,
  prescriptionRule,
  uniformSetTargets,
  type Evidence,
  type LoadSuggestion,
  type Prescription,
} from "./progression";
import type { Workout } from "@/features/workouts/types";
type RuleRow = {
  id: string;
  strategy: string;
  config_version: number;
  load_step_kg: number | null;
  rep_step: number | null;
  reps_min: number | null;
  reps_max: number | null;
  effort_scale: string | null;
  effort_value: number | null;
};
export function snapshotRule(row: RuleRow | undefined): ProgressionRule | null {
  if (!row) return null;
  const r = {
    version: row.config_version,
    strategy: row.strategy,
    ...(["linear_load", "double_progression", "effort_guided"].includes(
      row.strategy,
    )
      ? { loadStepKg: row.load_step_kg }
      : {}),
    ...(["double_progression", "rep_progression"].includes(row.strategy)
      ? { repStep: row.rep_step, repsMin: row.reps_min, repsMax: row.reps_max }
      : {}),
    ...(row.strategy === "effort_guided"
      ? { scale: row.effort_scale, target: row.effort_value }
      : {}),
  };
  return validateProgression(r) ? r : null;
}
type Input = {
  itemId: string;
  exerciseId: string;
  slotId: string;
  slot: {
    origin?: string;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    progression_rule_id?: string;
    sets?: {
      set_type: string;
      position: number;
      reps_min?: number | null;
      reps_max?: number | null;
      effort_scale?: "rpe" | "rir";
      effort_value?: number;
    }[];
  };
  rules: RuleRow[] | null;
  history: Evidence[];
};
export async function loadProgressionSuggestions(
  workout: Workout,
): Promise<Record<string, LoadSuggestion>> {
  if (!workout.isProgram || !workout.items.length) return {};
  await requireUser(`/workout/${workout.id}`);
  const client = await createClient({ readOnly: true });
  const result = await client.rpc("program_progression_evidence", {
    p_session: workout.id,
  });
  if (result.error)
    throw Error("Load suggestions could not be loaded. Please retry.");
  const suggestions: Record<string, LoadSuggestion> = {};
  for (const input of result.data as Input[]) {
    const item = workout.items.find((i) => i.id === input.itemId);
    if (
      !item ||
      item.bodyweightEligible ||
      ["bodyweight", "duration", "assisted"].includes(item.loggingKind ?? "")
    )
      continue;
    const planned = input.slot.sets?.filter((s) => s.set_type !== "warm_up");
    if (planned && !uniformSetTargets(planned)) continue;
    const p: Prescription = {
      sets: planned?.length || input.slot.target_sets,
      setNumbers: planned?.length ? planned.map((s) => s.position) : undefined,
      min: planned?.[0]?.reps_min ?? input.slot.target_reps_min,
      max: planned?.[0]?.reps_max ?? input.slot.target_reps_max,
      rule: prescriptionRule(
        snapshotRule(
          input.rules?.find((r) => r.id === input.slot.progression_rule_id),
        ),
        planned ?? [],
      ),
      scale: planned?.[0]?.effort_scale,
      effort: planned?.[0]?.effort_value,
    };
    // Closed summaries evaluate their own actual completed session; active
    // screens evaluate only earlier eligible completed performance.
    const suggestion = startingLoad({
      exerciseId: input.exerciseId,
      slotId: input.slotId,
      prescription: p,
      history: input.history,
      unit: workout.weightUnit,
      dumbbell: item.visual.slug?.includes("dumbbell"),
      now: workout.finishedAt ?? workout.startedAt,
    });
    if (suggestion) suggestions[item.id] = suggestion;
  }
  return suggestions;
}
export type Adherence = {
  assignmentId: string;
  activeSession: string | null;
  activeName: string | null;
  currentRotation: number;
  name: string;
  version: string;
  nextPosition: number;
  nextNumber: number;
  nextName: string;
  trainingDays: number;
  completedWorkouts: number;
  recentWorkouts: number;
  completedRotations: number;
  durationRotations: number | null;
  programComplete: boolean;
  completedMovements: number;
  partialMovements: number;
  lastName: string | null;
  lastAt: string | null;
};
export async function loadProgramAdherence(
  session?: string,
): Promise<Adherence | null> {
  await requireUser("/programs");
  const client = await createClient({ readOnly: true });
  const r = await client.rpc("program_adherence", {
    p_session: session ?? null,
  });
  if (r.error)
    throw Error("Program progress could not be loaded. Please retry.");
  return r.data as Adherence | null;
}

export type MovementOutcome = {
  movement: number;
  required: number;
  completed: number;
  repsAchieved: number;
};
export async function loadProgramOutcomes(
  workout: Workout,
): Promise<MovementOutcome[]> {
  if (!workout.isProgram || workout.status !== "completed") return [];
  await requireUser(`/workout/${workout.id}`);
  const client = await createClient({ readOnly: true });
  const r = await client.rpc("program_workout_outcomes", {
    p_session: workout.id,
  });
  if (r.error) throw Error("Workout targets could not be loaded.");
  return r.data as MovementOutcome[];
}
