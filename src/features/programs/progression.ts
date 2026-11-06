import { validateProgression, type ProgressionRule } from "./model";
import {
  displayWeight,
  weightToKg,
  type WeightUnit,
} from "@/features/sets/model";
export type Evidence = {
  exerciseId: string;
  sessionId: string;
  slotId: string | null;
  date: string;
  kg: number;
  reps: number;
  scale: "rpe" | "rir" | null;
  effort: number | null;
  failure: boolean;
  setNumber?: number | null;
};
export type Prescription = {
  sets: number;
  setNumbers?: number[];
  min: number;
  max: number;
  rule: ProgressionRule | null;
  scale?: "rpe" | "rir" | null;
  effort?: number | null;
};
export type LoadSuggestion = {
  kg: number;
  display: string;
  basis: string;
  action: "hold" | "increase" | "reps" | "estimate";
  reps?: number;
};
// Floor, never round up, and round in the account's displayed unit. Per-dumbbell
// records retain their existing load convention; there is no multiplication.
export function practicalLoad(kg: number, unit: WeightUnit, dumbbell: boolean) {
  const step = unit === "lb" ? 5 : dumbbell ? 2 : 2.5;
  const raw = Number(
    displayWeight(Math.min(100000, Math.round(kg * 1000) / 1000), unit),
  );
  const display = String(Math.floor((raw + 0.000001) / step) * step);
  return { display, kg: Number(weightToKg(display, unit)) };
}
export function evaluateProgression(
  p: Prescription,
  sets: readonly Evidence[],
) {
  const rule = p.rule;
  const hold = {
    action: "hold" as const,
    reason: "Repeat the previous load while building consistent sets.",
  };
  if (
    !rule ||
    !validateProgression(rule) ||
    rule.strategy === "fixed" ||
    rule.strategy === "manual"
  )
    return {
      ...hold,
      reason:
        rule?.strategy === "manual"
          ? "Choose your next load manually."
          : "Keep the fixed prescription.",
    };
  if (sets.length < p.sets || p.sets < 1)
    return {
      ...hold,
      reason: "Complete all prescribed working sets before progressing.",
    };
  const required = sets.slice(0, p.sets);
  if (
    required.some(
      (s) =>
        s.failure ||
        (s.scale === "rpe" && s.effort !== null && s.effort >= 9.5) ||
        (s.scale === "rir" && s.effort !== null && s.effort <= 0),
    )
  )
    return {
      ...hold,
      reason: "High reported effort: repeat the load rather than increase it.",
    };
  if (
    p.scale &&
    p.effort != null &&
    required.some(
      (s) =>
        s.scale === p.scale &&
        s.effort != null &&
        (p.scale === "rpe" ? s.effort > p.effort! : s.effort < p.effort!),
    )
  )
    return {
      ...hold,
      reason: "Reported effort exceeded the prescribed target.",
    };
  if (required.some((s) => s.reps < p.min)) return hold;
  // Mixed loads cannot establish a repeatable full prescription at the top load.
  if (new Set(required.map((s) => Math.round(s.kg * 1000))).size !== 1)
    return {
      ...hold,
      reason: "Use a consistent working load before progressing.",
    };
  if (rule.strategy === "effort_guided") {
    if (
      required.some(
        (s) =>
          s.scale !== rule.scale ||
          s.effort === null ||
          (rule.scale === "rpe"
            ? s.effort > rule.target
            : s.effort < rule.target),
      )
    )
      return {
        ...hold,
        reason: "Matching actual effort ratings are needed for this rule.",
      };
  }
  if (rule.strategy === "rep_progression") {
    const reps = Math.min(
      rule.repsMax,
      Math.min(...required.map((s) => s.reps)) + rule.repStep,
    );
    return {
      action: "reps" as const,
      reps,
      reason: `Aim for ${reps} reps at the same load.`,
    };
  }
  if (
    rule.strategy === "double_progression" &&
    required.some((s) => s.reps < Math.max(rule.repsMax, p.max))
  )
    return {
      ...hold,
      reason: "Build every prescribed set to the top of the rep range.",
    };
  const base = required[0].kg;
  if (!("loadStepKg" in rule)) return hold;
  if (base + rule.loadStepKg > 100000)
    return {
      ...hold,
      reason: "The next load step exceeds the supported recording range.",
    };
  if (rule.loadStepKg > Math.min(10, base * 0.1))
    return {
      ...hold,
      reason:
        "The configured load step is too large for a conservative increase.",
    };
  return {
    action: "increase" as const,
    kg: base + rule.loadStepKg,
    reason: "All required sets met the rule. Consider a small load increase.",
  };
}
export function startingLoad(input: {
  exerciseId: string;
  slotId: string;
  prescription: Prescription;
  history: readonly Evidence[];
  unit: WeightUnit;
  dumbbell?: boolean;
  now: string;
}): LoadSuggestion | null {
  const { prescription: p, unit } = input;
  if (p.min < 1 || p.max > 1000 || p.max < p.min) return null;
  const cutoff = Date.parse(input.now) - 180 * 86400000;
  const history = input.history
    .filter(
      (s) =>
        s.exerciseId === input.exerciseId &&
        Number.isFinite(s.kg) &&
        s.kg > 0 &&
        s.reps > 0 &&
        Date.parse(s.date) >= cutoff &&
        Date.parse(s.date) <= Date.parse(input.now),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.sessionId.localeCompare(b.sessionId),
    );
  if (!history.length) return null;
  const slot = history.filter((s) => s.slotId === input.slotId);
  let base: number,
    basis: string,
    action: LoadSuggestion["action"] = "hold",
    reps: number | undefined;
  if (slot.length) {
    const recent = slot
      .filter(
        (s) =>
          s.sessionId === slot[0].sessionId &&
          (s.setNumber === undefined ||
            (s.setNumber !== null &&
              (p.setNumbers
                ? p.setNumbers.includes(s.setNumber)
                : s.setNumber <= p.sets))),
      )
      .sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0));
    if (!recent.length) return null;
    // The source must resemble this prescription; an unrelated low-rep effort
    // in the same slot goes through conservative estimation instead.
    if (recent.every((s) => s.reps >= p.min - 2)) {
      const result = evaluateProgression(p, recent);
      base =
        result.action === "increase"
          ? result.kg
          : Math.min(...recent.map((s) => s.kg));
      basis = result.reason;
      action = result.action;
      reps = "reps" in result ? result.reps : undefined;
    } else return estimate();
  } else {
    const near = history.find((s) => s.reps >= p.min && s.reps <= p.max);
    const similar = history.find(
      (s) => s.reps >= p.min - 2 && s.reps <= p.max + 2,
    );
    if (near || similar) {
      const source = near ?? similar!;
      base = source.kg * (source.failure ? 0.95 : 1);
      basis = near
        ? "Recent completed sets for this exercise in the target rep range."
        : "Recent exact-exercise performance near the target range; start conservatively.";
    } else return estimate();
  }
  const rounded = practicalLoad(base, unit, !!input.dumbbell);
  if (!rounded.kg) return null;
  // Never turn a sub-increment configured step into a larger practical jump.
  if (
    action === "increase" &&
    rounded.kg <=
      Math.min(
        ...slot
          .filter((s) => s.sessionId === slot[0].sessionId)
          .map((s) => s.kg),
      )
  )
    action = "hold";
  return { ...rounded, basis, action, reps };
  function estimate(): LoadSuggestion | null {
    if (p.max > 15) return null;
    const eligible = history.filter((s) => s.reps <= 10);
    if (!eligible.length) return null;
    // Epley (same 1–10 rep boundary as records), inverted for target maximum,
    // then 10% reserve. This is guidance, never an actual historical record.
    const source = eligible[0];
    const estimatedMax =
      source.reps === 1 ? source.kg : source.kg * (1 + source.reps / 30);
    const load = practicalLoad(
      (estimatedMax / (1 + p.max / 30)) * 0.9,
      unit,
      !!input.dumbbell,
    );
    return load.kg > 0
      ? {
          ...load,
          action: "estimate",
          basis:
            "Conservative Epley estimate from recent exact-exercise performance, with 10% reserve.",
        }
      : null;
  }
}

type PlannedSet = {
  set_type: string;
  reps_min?: number | null;
  reps_max?: number | null;
  effort_scale?: string | null;
  effort_value?: number | null;
};
export function uniformSetTargets(sets: readonly PlannedSet[]) {
  if (!sets.length) return true;
  const first = sets[0];
  return sets.every(
    (s) =>
      s.set_type === "working" &&
      s.reps_min === first.reps_min &&
      s.reps_max === first.reps_max &&
      s.effort_scale === first.effort_scale &&
      s.effort_value === first.effort_value,
  );
}
export function prescriptionRule(
  rule: ProgressionRule | null,
  sets: readonly PlannedSet[],
): ProgressionRule | null {
  // Mixed/varied prescriptions stay fully loggable; never flatten their targets.
  return uniformSetTargets(sets) ? rule : { version: 1, strategy: "manual" };
}
