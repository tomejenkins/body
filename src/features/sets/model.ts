export type WeightUnit = "kg" | "lb";
export type SetType = "working" | "warm_up" | "drop" | "rest_pause";
export type LoadMode = "external" | "bodyweight";
export type LoggedSet = {
  id: string;
  workout_exercise_id: string;
  position: number;
  set_type: SetType;
  load_mode: LoadMode;
  status: "pending" | "completed" | "skipped";
  actual_reps: number | null;
  actual_weight_kg: number | null;
  completed_at: string | null;
  revision: number;
  last_mutation_id: string | null;
  deleted_at: string | null;
  is_automatic?: boolean;
  inputs_confirmed?: boolean;
  prescribed_reps_min?: number | null;
  prescribed_weight_kg?: number | null;
  suggested_from_date?: string | null;
  entered_weight?: number | null;
  entered_unit?: WeightUnit | null;
};
export type SetDraft = {
  weight: string;
  reps: string;
  type: SetType;
  mode: LoadMode;
  completed: boolean;
  weightDirty: boolean;
};
export type SetCommand = {
  itemId: string;
  id: string;
  operation: "add" | "save" | "move" | "remove";
  revision: number | null;
  mutation: string;
  reps: number | null;
  weight: string | null;
  type: SetType;
  mode: LoadMode;
  completed: boolean;
  direction?: -1 | 1;
  enteredWeight?: string | null;
  enteredUnit?: WeightUnit | null;
};
export type SetResult = {
  rows?: LoggedSet[];
  error?: string;
  conflict?: boolean;
};
export const setTypes: Record<SetType, string> = {
  working: "Normal working set",
  warm_up: "Warm-up",
  drop: "Drop set",
  rest_pause: "Rest-pause",
};
// 1 lb = exactly 0.45359237 kg. Integer rational arithmetic rounds once at
// the storage boundary to 0.001 kg, never on a display-unit toggle.
function scaled(value: string) {
  if (!/^\d{1,6}(?:\.\d{1,6})?$/.test(value))
    throw new Error(
      "Enter a non-negative weight with up to six decimal places.",
    );
  const [a, b = ""] = value.split(".");
  return BigInt(a) * 1000000n + BigInt(b.padEnd(6, "0"));
}
function rounded(n: bigint, d: bigint) {
  return (n + d / 2n) / d;
}
function decimal(milli: bigint) {
  const s = milli.toString().padStart(4, "0");
  return (s.slice(0, -3) + "." + s.slice(-3)).replace(/\.?0+$/, "") || "0";
}
export function weightToKg(value: string, unit: WeightUnit): string | null {
  if (!value.trim()) return null;
  const micro = scaled(value.trim());
  const milli =
    unit === "kg"
      ? rounded(micro, 1000n)
      : rounded(micro * 45359237n, 100000000000n);
  if (milli > 100000000n)
    throw new Error("External load must be at most 100,000 kg.");
  return decimal(milli);
}
export function displayWeight(kg: number | null, unit: WeightUnit) {
  if (kg === null) return "";
  const milli = rounded(scaled(String(kg)), 1000n);
  return decimal(
    unit === "kg" ? milli : rounded(milli * 10000000n, 45359237n) * 10n,
  );
}
export function draftFor(row: LoggedSet, unit: WeightUnit): SetDraft {
  const load =
    row.inputs_confirmed === false
      ? (row.prescribed_weight_kg ?? null)
      : row.actual_weight_kg;
  const reps =
    row.inputs_confirmed === false
      ? (row.prescribed_reps_min ?? null)
      : row.actual_reps;
  return {
    weight:
      row.entered_unit === unit && row.entered_weight != null
        ? String(row.entered_weight)
        : displayWeight(load, unit),
    reps: reps === null ? "" : String(reps),
    type: row.set_type,
    mode: row.load_mode,
    completed: row.status === "completed",
    weightDirty: false,
  };
}
export function valuesFor(
  draft: SetDraft,
  unit: WeightUnit,
  canonical: LoggedSet | null,
) {
  const reps = draft.reps.trim() === "" ? null : Number(draft.reps);
  if (
    reps !== null &&
    (!/^\d+$/.test(draft.reps.trim()) ||
      !Number.isInteger(reps) ||
      reps < 0 ||
      reps > 1000)
  )
    throw new Error("Enter whole-number reps from 0 to 1,000.");
  const weight =
    draft.mode === "bodyweight"
      ? null
      : draft.weightDirty || !canonical
        ? weightToKg(draft.weight, unit)
        : (canonical.inputs_confirmed === false
              ? canonical.prescribed_weight_kg
              : canonical.actual_weight_kg) == null
          ? null
          : String(
              canonical.inputs_confirmed === false
                ? canonical.prescribed_weight_kg
                : canonical.actual_weight_kg,
            );
  if (
    draft.completed &&
    (reps === null || (draft.mode === "external" && weight === null))
  )
    throw new Error(
      "Enter actual reps and external load before completing this set.",
    );
  return {
    reps,
    weight,
    type: draft.type,
    mode: draft.mode,
    completed: draft.completed,
    enteredWeight:
      draft.mode === "bodyweight" || weight === null
        ? null
        : draft.weightDirty
          ? draft.weight.trim()
          : canonical?.entered_weight != null
            ? String(canonical.entered_weight)
            : null,
    enteredUnit:
      draft.mode === "bodyweight" || weight === null
        ? null
        : draft.weightDirty
          ? unit
          : (canonical?.entered_unit ?? null),
  };
}
export function summarizeSets(
  groups: readonly { sets: LoggedSet[]; prescribedSets?: number | null }[],
) {
  const rows = groups.flatMap((g) => g.sets).filter((r) => !r.deleted_at);
  const completed = rows.filter((r) => r.status === "completed").length;
  return {
    completed,
    pending: rows.length - completed,
    completion:
      completed === 0
        ? "none"
        : completed === rows.length &&
            groups.every(
              (g) =>
                g.sets.filter((r) => !r.deleted_at).length >=
                (g.prescribedSets ?? 1),
            )
          ? "full"
          : "partial",
  } as const;
}

export function newSetDraft(
  previous: SetDraft | undefined,
  bodyweight: boolean,
): SetDraft {
  return previous
    ? { ...previous, type: "working", completed: false }
    : {
        weight: "",
        reps: "",
        type: "working",
        mode: bodyweight ? "bodyweight" : "external",
        completed: false,
        weightDirty: true,
      };
}
export function compareSets(a: LoggedSet, b: LoggedSet): number {
  return a.position - b.position || a.id.localeCompare(b.id);
}
