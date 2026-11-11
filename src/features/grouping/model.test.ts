import { expect, it } from "vitest";
import {
  groupRounds,
  validMembers,
  orderedGroups,
  groupItems,
  type ExerciseGroup,
  type GroupMember,
} from "./model";
import type { WorkoutItem } from "@/features/workouts/types";
const a: GroupMember = {
    type: "movement",
    id: "12345678-1234-1234-1234-123456789001",
  },
  b: GroupMember = {
    type: "selection",
    id: "12345678-1234-1234-1234-123456789002",
  },
  c: GroupMember = {
    type: "movement",
    id: "12345678-1234-1234-1234-123456789003",
  };
it("accepts two/three distinct identities, rejects duplicates, invalid targets and unsupported counts", () => {
  expect(validMembers([a, b])).toBe(true);
  expect(validMembers([a, b, c])).toBe(true);
  for (const members of [
    [],
    [a],
    [a, a],
    [a, b, c, a],
    [{ ...a, type: "circuit" }, b],
    [{ ...a, id: "foreign-name" }, b],
    [{ ...a, owner: "caller" }, b],
  ])
    expect(validMembers(members)).toBe(false);
});
it("numbers by workout presentation order while retaining stable group identity and member order", () => {
  const groups: ExerciseGroup[] = [
    {
      id: "later",
      type: "superset",
      revision: 1,
      members: [c, b],
      sourceGroupId: null,
    },
    {
      id: "first",
      type: "superset",
      revision: 4,
      members: [a, { ...a, id: "12345678-1234-1234-1234-123456789004" }],
      sourceGroupId: "source",
    },
  ];
  expect(
    orderedGroups(groups, [
      `movement:${a.id}`,
      `movement:${c.id}`,
      `selection:${b.id}`,
    ]).map((g) => g.id),
  ).toEqual(["first", "later"]);
  expect(groups[0].members).toEqual([c, b]);
  expect(groups[1].revision).toBe(4);
});
it("creates alternating display rounds only from real unequal rows without completing or adding anything", () => {
  const saved = () => ({
      row: {
        status: "completed" as const,
        inputs_confirmed: true,
        deleted_at: null,
      },
    }),
    pending = {
      row: {
        status: "pending" as const,
        inputs_confirmed: false,
        deleted_at: null,
      },
    };
  const members = [
    { member: a, entries: [saved(), saved(), pending] },
    { member: b, entries: [saved(), saved()] },
    { member: c, entries: [saved()] },
  ];
  const rounds = groupRounds(members);
  expect(rounds.map((r) => r.entries.map((e) => e.label))).toEqual([
    ["A1", "A2", "A3"],
    ["A1", "A2"],
    ["A1"],
  ]);
  expect(rounds.map((r) => r.completed)).toEqual([true, true, false]);
  expect(members.map((m) => m.entries.length)).toEqual([3, 2, 1]);
  expect(pending.row.status).toBe("pending");
  expect(groupRounds([])).toEqual([]);
});
it("keeps removed rows out of rounds and unconfirmed completion out of saved status", () => {
  const rounds = groupRounds([
    {
      member: a,
      entries: [
        {
          row: {
            status: "completed" as const,
            inputs_confirmed: false,
            deleted_at: null,
          },
        },
        {
          row: {
            status: "completed" as const,
            inputs_confirmed: true,
            deleted_at: "removed",
          },
        },
      ],
    },
  ]);
  expect(rounds).toHaveLength(1);
  expect(rounds[0].completed).toBe(false);
});
it("resolves movement selections separately from a bare exercise selection", () => {
  const items = [
    { id: "earlier", programMovementId: a.id, position: 1 },
    { id: "current", programMovementId: a.id, position: 2 },
    { id: b.id, programMovementId: null, position: 3 },
  ] as WorkoutItem[];
  expect(groupItems({ items }, a).map((i) => i.id)).toEqual([
    "earlier",
    "current",
  ]);
  expect(groupItems({ items }, b).map((i) => i.id)).toEqual([b.id]);
});

it("withholds round Saved while a previously completed row has an unconfirmed correction", () => {
  const entry = {
    row: {
      status: "completed" as const,
      inputs_confirmed: true,
      deleted_at: null,
    },
    pending: true,
  };
  const members = [{ member: a, entries: [entry] }];
  expect(groupRounds(members, (e) => !e.pending)[0].completed).toBe(false);
  entry.pending = false;
  expect(groupRounds(members, (e) => !e.pending)[0].completed).toBe(true);
});
