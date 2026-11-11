import { expect, it } from "vitest";
import { favoriteDefaultName } from "./favorite-name";
it("keeps the source display name without dates, prompts or suffixes", () => {
  expect(favoriteDefaultName("  Back Day  ")).toBe("Back Day");
  expect(favoriteDefaultName("Ad-hoc workout")).toBe("Workout");
  expect(favoriteDefaultName("  ")).toBe("Workout");
});
it("respects the existing database 100-character cap without splitting Unicode", () => {
  expect(favoriteDefaultName("x".repeat(150))).toHaveLength(100);
  expect(favoriteDefaultName("🏋".repeat(120))).toHaveLength(100);
  expect(Array.from(favoriteDefaultName("🏋".repeat(120)))).toHaveLength(50);
});
