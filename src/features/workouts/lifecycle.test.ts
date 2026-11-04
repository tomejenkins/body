import { expect, it } from "vitest";
import { adjacentItem, canTransition, orderedItems } from "./lifecycle";
import type { WorkoutItem } from "./types";
const item = (id: string, position: number): WorkoutItem => ({
  id,
  position,
  exerciseId: id,
  name: id,
  canRemove: true,
  bodyweightEligible: false,
  exerciseType: "compound",
  sets: [],
  visual: { slug: "", ownerId: null },
});
it("only allows active workouts to finish or abandon, never reopen", () => {
  expect(canTransition("in_progress", "completed")).toBe(true);
  expect(canTransition("in_progress", "abandoned")).toBe(true);
  expect(canTransition("completed", "in_progress")).toBe(false);
  expect(canTransition("abandoned", "completed")).toBe(false);
});
it("orders selections with gaps without mutating snapshots or caller data", () => {
  const source = [item("b", 9), item("a", 2)];
  expect(orderedItems(source).map((i) => i.id)).toEqual(["a", "b"]);
  expect(source[0].id).toBe("b");
  expect(adjacentItem(source, "b", -1)?.id).toBe("a");
  expect(adjacentItem(source, "a", -1)).toBeUndefined();
  expect(adjacentItem(source, "missing", 1)).toBeUndefined();
});
