export type EffortScale = "rpe" | "rir";
export type ReportedEffort = {
  scale: EffortScale | null;
  value: number | null;
  failure: boolean;
};
export const rpeValues = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;
export const rirValues = [0, 1, 2, 3, 4, 5] as const;
export function validEffort(value: unknown): value is ReportedEffort {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => !["scale", "value", "failure"].includes(k)) ||
    typeof v.failure !== "boolean"
  )
    return false;
  if (v.scale === null && v.value === null) return true;
  if (typeof v.value !== "number" || !Number.isFinite(v.value)) return false;
  return v.scale === "rpe"
    ? v.value >= 6 && v.value <= 10 && Number.isInteger(v.value * 2)
    : v.scale === "rir" &&
        v.value >= 0 &&
        v.value <= 5 &&
        Number.isInteger(v.value);
}
export function effortSummary(row: {
  effort_scale?: string | null;
  effort_value?: number | null;
  performed_to_failure?: boolean;
}) {
  const parts: string[] = [];
  if (row.performed_to_failure) parts.push("To Failure");
  if (row.effort_scale && row.effort_value != null)
    parts.push(
      `${row.effort_scale.toUpperCase()} ${row.effort_scale === "rir" && row.effort_value === 5 ? "5+" : row.effort_value}`,
    );
  return parts.join(" · ");
}
