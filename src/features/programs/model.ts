import { validEffort, type EffortScale } from "@/features/sets/effort";
export type ProgramOrigin =
  "body_authored" | "user_created" | "user_copy" | "authorized_creator";
export type ProgramVisibility = "private" | "public";
export type ProgressionRule = { version: 1 } & (
  | { strategy: "fixed" | "manual" }
  | { strategy: "linear_load"; loadStepKg: number }
  | {
      strategy: "double_progression";
      loadStepKg: number;
      repStep: number;
      repsMin: number;
      repsMax: number;
    }
  | {
      strategy: "rep_progression";
      repStep: number;
      repsMin: number;
      repsMax: number;
    }
  | {
      strategy: "effort_guided";
      loadStepKg: number;
      scale: EffortScale;
      target: number;
    }
);
export function validateProgression(value: unknown): value is ProgressionRule {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const allowed: Record<string, string[]> = {
    fixed: [],
    manual: [],
    linear_load: ["loadStepKg"],
    double_progression: ["loadStepKg", "repStep", "repsMin", "repsMax"],
    rep_progression: ["repStep", "repsMin", "repsMax"],
    effort_guided: ["loadStepKg", "scale", "target"],
  };
  if (
    v.version !== 1 ||
    typeof v.strategy !== "string" ||
    !Object.hasOwn(allowed, v.strategy) ||
    Object.keys(v).some(
      (k) =>
        !["version", "strategy", ...allowed[v.strategy as string]].includes(k),
    )
  )
    return false;
  const positive = (n: unknown, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n > 0 && n <= max;
  if (
    ["linear_load", "double_progression", "effort_guided"].includes(
      v.strategy,
    ) &&
    !positive(v.loadStepKg, 1000)
  )
    return false;
  if (
    ["double_progression", "rep_progression"].includes(v.strategy) &&
    (!positive(v.repStep, 1000) ||
      !Number.isInteger(v.repStep) ||
      !positive(v.repsMin, 1000) ||
      !positive(v.repsMax, 1000) ||
      !Number.isInteger(v.repsMin) ||
      !Number.isInteger(v.repsMax) ||
      Number(v.repsMax) < Number(v.repsMin))
  )
    return false;
  return (
    v.strategy !== "effort_guided" ||
    validEffort({ scale: v.scale, value: v.target, failure: false })
  );
}
export type RotationDay = { position: number; rest: boolean; name: string };
export function validateRotation(
  cycleLength: number,
  days: readonly RotationDay[],
) {
  return (
    Number.isInteger(cycleLength) &&
    cycleLength >= 1 &&
    cycleLength <= 366 &&
    days.length === cycleLength &&
    new Set(days.map((d) => d.position)).size === cycleLength &&
    days.every(
      (d) =>
        Number.isInteger(d.position) &&
        d.position >= 1 &&
        d.position <= cycleLength &&
        d.name.trim().length > 0 &&
        d.name.trim().length <= 200,
    )
  );
}
export function nextRotationPosition(position: number, cycleLength: number) {
  if (
    !Number.isInteger(cycleLength) ||
    cycleLength < 1 ||
    cycleLength > 366 ||
    !Number.isInteger(position) ||
    position < 1 ||
    position > cycleLength
  )
    throw new Error("Invalid rotation position.");
  return (position % cycleLength) + 1;
}
export function progressionColumns(rule: ProgressionRule) {
  if (!validateProgression(rule))
    throw new Error("Invalid progression configuration.");
  return {
    strategy: rule.strategy,
    config_version: rule.version,
    load_step_kg: "loadStepKg" in rule ? rule.loadStepKg : null,
    rep_step: "repStep" in rule ? rule.repStep : null,
    reps_min: "repsMin" in rule ? rule.repsMin : null,
    reps_max: "repsMax" in rule ? rule.repsMax : null,
    effort_scale: "scale" in rule ? rule.scale : null,
    effort_value: "target" in rule ? rule.target : null,
  };
}
