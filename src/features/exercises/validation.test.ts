import { expect, it } from "vitest";
import { parseExercise } from "./validation";
const id = "12345678-1234-1234-1234-123456789012";
function form() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    name: "My squat",
    exerciseType: "compound",
    primaryPatternId: id,
    primaryMuscleIds: id,
    equipmentIds: id,
  }))
    f.append(k, v);
  return f;
}
it("retains selected custom classification and normalizes display text", () => {
  const f = form();
  f.set("name", "  My squat  ");
  expect(parseExercise(f).exerciseType).toBe("compound");
  expect(parseExercise(f).name).toBe("My squat");
});
it("rejects missing or unrestricted exercise types", () => {
  for (const type of ["", "anything"]) {
    const f = form();
    f.set("exerciseType", type);
    expect(() => parseExercise(f)).toThrow("Choose compound");
  }
});
it("requires a primary pattern, muscles and equipment", () => {
  for (const field of [
    "primaryPatternId",
    "primaryMuscleIds",
    "equipmentIds",
  ]) {
    const f = form();
    f.delete(field);
    expect(() => parseExercise(f)).toThrow();
  }
});
it("rejects overlapping or malformed classifications and excessive notes", () => {
  const f = form();
  f.append("secondaryMuscleIds", id);
  expect(() => parseExercise(f)).toThrow("distinct");
  f.delete("secondaryMuscleIds");
  f.set("equipmentIds", "invalid");
  expect(() => parseExercise(f)).toThrow("Invalid");
  f.set("equipmentIds", id);
  f.set("instructions", "x".repeat(3001));
  expect(() => parseExercise(f)).toThrow("3,000");
});
