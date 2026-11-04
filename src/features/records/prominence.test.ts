import { expect, it } from "vitest";
import { recordProfile } from "./prominence";
import catalog from "../../../supabase/catalog/exercises.json";
it("assigns exactly the three explicitly identified major lifts to primary", () => {
  const primary = catalog.exercises
    .filter((e) => recordProfile(e.id).prominence === "primary")
    .map((e) => e.slug)
    .sort();
  expect(primary).toEqual([
    "barbell_back_squat",
    "barbell_bench_press",
    "conventional_deadlift",
  ]);
});
it("keeps variants distinct and every catalog/custom exercise eligible", () => {
  const bench = catalog.exercises.find((e) => e.slug === "barbell_bench_press");
  const incline = catalog.exercises.find(
    (e) => e.slug === "incline_barbell_bench_press",
  );
  if (!bench || !incline) throw Error("Missing catalog identities");
  expect(recordProfile(bench.id).family).toBe(recordProfile(incline.id).family);
  expect(recordProfile(incline.id).prominence).toBe("secondary");
  expect(recordProfile(bench.id).exerciseId).not.toBe(
    recordProfile(incline.id).exerciseId,
  );
  for (const e of catalog.exercises)
    expect(["primary", "secondary", "standard"]).toContain(
      recordProfile(e.id).prominence,
    );
  expect(recordProfile("custom-bench-squat-deadlift")).toEqual({
    exerciseId: "custom-bench-squat-deadlift",
    prominence: "standard",
    family: null,
  });
});
