import type { LoggedSet } from "@/features/sets/model";
type SavedEntry = {
  row: Pick<LoggedSet, "status" | "deleted_at" | "inputs_confirmed">;
  dirty: boolean;
  pending: number;
  error?: string;
  localOnly?: boolean;
  deleting?: boolean;
  conflict?: unknown;
};
// A navigation affordance for saved visible rows, not training/program eligibility.
export function exerciseSetsConfirmed(entries: readonly SavedEntry[]) {
  const applicable = entries.filter((entry) => !entry.row.deleted_at);
  return (
    applicable.length > 0 &&
    applicable.every(
      (entry) =>
        entry.row.status === "completed" &&
        entry.row.inputs_confirmed === true &&
        !entry.dirty &&
        !entry.pending &&
        !entry.error &&
        !entry.localOnly &&
        !entry.deleting &&
        !entry.conflict,
    )
  );
}
