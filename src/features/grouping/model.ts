import { isUuid } from "@/features/exercises/validation";
import type { LoggedSet } from "@/features/sets/model";
import type { Workout } from "@/features/workouts/types";
export type GroupMember = { type: "movement" | "selection"; id: string };
export type ExerciseGroup = {
  id: string;
  type: "superset";
  revision: number;
  members: GroupMember[];
  sourceGroupId: string | null;
};
export type GroupCommand = {
  session: string;
  group: string;
  operation: "create" | "edit" | "ungroup";
  expected: number;
  members: GroupMember[];
  request: string;
};
export const memberKey = (member: GroupMember) => `${member.type}:${member.id}`;
export function validMembers(members: unknown): members is GroupMember[] {
  return (
    Array.isArray(members) &&
    members.length >= 2 &&
    members.length <= 3 &&
    members.every(
      (m) =>
        m &&
        ["movement", "selection"].includes(m.type) &&
        typeof m.id === "string" &&
        isUuid(m.id) &&
        Object.keys(m).length === 2,
    ) &&
    new Set(members.map(memberKey)).size === members.length
  );
}
export function groupItems(
  workout: Pick<Workout, "items">,
  member: GroupMember,
) {
  return workout.items
    .filter((item) =>
      member.type === "movement"
        ? item.programMovementId === member.id
        : item.id === member.id,
    )
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}
export function currentMemberItem(
  workout: Pick<Workout, "items">,
  member: GroupMember,
) {
  return groupItems(workout, member).at(-1);
}
export function orderedGroups(groups: ExerciseGroup[], keys: string[]) {
  const positions = new Map(keys.map((key, index) => [key, index]));
  return [...groups].sort(
    (a, b) =>
      Math.min(
        ...a.members.map((m) => positions.get(memberKey(m)) ?? Infinity),
      ) -
        Math.min(
          ...b.members.map((m) => positions.get(memberKey(m)) ?? Infinity),
        ) || a.id.localeCompare(b.id),
  );
}
export function groupRounds<
  T extends {
    row: Pick<LoggedSet, "status" | "inputs_confirmed" | "deleted_at">;
  },
>(
  members: { member: GroupMember; entries: T[] }[],
  isConfirmed: (entry: T) => boolean = (entry) =>
    entry.row.status === "completed" && entry.row.inputs_confirmed === true,
) {
  const rows = members.map((m) => ({
    ...m,
    entries: m.entries.filter((e) => !e.row.deleted_at),
  }));
  return Array.from(
    { length: Math.max(0, ...rows.map((m) => m.entries.length)) },
    (_, index) => ({
      number: index + 1,
      entries: rows.flatMap((m, memberIndex) => {
        const entry = m.entries[index];
        return entry
          ? [{ entry, member: m.member, label: `A${memberIndex + 1}`, index }]
          : [];
      }),
      completed: rows.every(
        (m) => !m.entries[index] || isConfirmed(m.entries[index]),
      ),
    }),
  );
}
