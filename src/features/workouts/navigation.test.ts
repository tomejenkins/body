import { expect, it } from "vitest";
import {
  builderHref,
  builderFilterQuery,
  parseBuilderFilters,
  exerciseHref,
  contextFilters,
  queryParams,
} from "./navigation";
const id = "12345678-1234-1234-1234-123456789012",
  exercise = "22345678-1234-1234-1234-123456789012";
it("round-trips deliberate filter state across detail and Look Back links", () => {
  const state = parseBuilderFilters(
    new URLSearchParams({
      search: "bench press",
      movement: id,
      muscle: exercise,
      type: "compound",
      equipment: id,
      equipmentOnly: "1",
      favorites: "1",
      refine: "1",
      recents: "1",
      suggestions: "1",
    }),
  );
  expect(parseBuilderFilters(builderFilterQuery(state))).toEqual(state);
  const detail = new URL(
    exerciseHref(exercise, id, state),
    "https://body.example",
  );
  expect(detail.searchParams.get("workoutId")).toBe(id);
  expect(contextFilters(detail.searchParams.get("builder"))).toEqual(state);
  expect(builderHref(id, state)).toContain(`/workout/${id}/select?`);
  expect(exerciseHref(exercise, id, state, true)).toContain(
    `/exercises/${exercise}/history?`,
  );
});
it("drops untrusted return paths, invalid IDs and oversized state", () => {
  expect(builderHref("https://evil.example")).toBe("/workout");
  expect(exerciseHref(exercise, "bad")).toBe(`/exercises/${exercise}`);
  const state = contextFilters(
    "returnTo=https://evil.example&movement=bad&type=administrator&equipment=bad&search=" +
      "a".repeat(140),
  );
  expect(state?.search).toHaveLength(120);
  expect(state?.movement).toBe("");
  expect(state?.type).toBe("");
  expect(state?.equipment).toEqual([]);
  expect(builderHref(id, state)).not.toContain("evil");
  expect(contextFilters("a".repeat(6001))).toBeUndefined();
  expect(queryParams({ workoutId: [id, exercise] }).has("workoutId")).toBe(
    false,
  );
});
it("keeps normal library URLs free of workout context", () => {
  expect(exerciseHref(exercise)).toBe(`/exercises/${exercise}`);
  expect(exerciseHref(exercise, undefined, undefined, true)).toBe(
    `/exercises/${exercise}/history`,
  );
});

it("uses validated exercise selection identities without accepting return URLs", async () => {
  const { loggerHref } = await import("./navigation");
  expect(loggerHref(id, exercise)).toBe(`/workout/${id}?exercise=${exercise}`);
  expect(loggerHref(id, "https://evil.example")).toBe(`/workout/${id}`);
  expect(loggerHref("invalid", exercise)).toBe("/workout");
  const link = new URL(
    exerciseHref(exercise, id, undefined, true, exercise),
    "https://body.example",
  );
  expect(link.searchParams.get("workoutItemId")).toBe(exercise);
  expect(link.pathname).toBe(`/exercises/${exercise}/history`);
});
