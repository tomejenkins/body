import { expect, it } from "vitest";
import {
  evaluateProgression,
  startingLoad,
  practicalLoad,
  prescriptionRule,
  uniformSetTargets,
  type Evidence,
  type Prescription,
} from "./progression";
const now = "2026-11-06T12:00:00Z";
const set: Evidence = {
  exerciseId: "bench",
  slotId: "slot",
  sessionId: "a",
  date: "2026-11-05T12:00:00Z",
  kg: 100,
  reps: 12,
  scale: null,
  effort: null,
  failure: false,
};
const p: Prescription = {
  sets: 3,
  min: 8,
  max: 12,
  rule: {
    version: 1,
    strategy: "double_progression",
    loadStepKg: 2.5,
    repStep: 1,
    repsMin: 8,
    repsMax: 12,
  },
};
const rows = (reps = [12, 12, 12]) => reps.map((n) => ({ ...set, reps: n }));
const suggest = (
  history: Evidence[],
  extra: Partial<Parameters<typeof startingLoad>[0]> = {},
) =>
  startingLoad({
    exerciseId: "bench",
    slotId: "slot",
    prescription: p,
    history,
    unit: "kg",
    now,
    ...extra,
  });
it("uses same-slot exact-exercise all-set success for a modest repeat load increase", () => {
  expect(suggest(rows())).toMatchObject({ kg: 102.5, action: "increase" });
});
it("partial upper-range achievement holds; fewer sets cannot progress", () => {
  expect(suggest(rows([12, 10, 9]))?.kg).toBe(100);
  expect(suggest(rows([12]))?.kg).toBe(100);
});
it("optional failure and high effort prevent increases independently", () => {
  for (const patch of [
    { failure: true },
    { scale: "rpe" as const, effort: 10 },
    { scale: "rir" as const, effort: 0 },
  ])
    expect(suggest(rows().map((s) => ({ ...s, ...patch })))?.action).toBe(
      "hold",
    );
});
it("missing effort is allowed for double progression but never fabricated for effort guidance", () => {
  expect(suggest(rows())?.action).toBe("increase");
  expect(
    evaluateProgression(
      {
        ...p,
        rule: {
          version: 1,
          strategy: "effort_guided",
          scale: "rir",
          target: 2,
          loadStepKg: 2.5,
        },
      },
      rows(),
    ).action,
  ).toBe("hold");
});
it("uses actual matching effort, never converts RPE to RIR", () => {
  const rule = {
    version: 1 as const,
    strategy: "effort_guided" as const,
    scale: "rir" as const,
    target: 2,
    loadStepKg: 2.5,
  };
  expect(
    evaluateProgression(
      { ...p, rule },
      rows().map((s) => ({ ...s, scale: "rir", effort: 2 })),
    ).action,
  ).toBe("increase");
  expect(
    evaluateProgression(
      { ...p, rule },
      rows().map((s) => ({ ...s, scale: "rpe", effort: 8 })),
    ).action,
  ).toBe("hold");
});
it("prescribed effort is distinct from actual effort and excessive reported effort holds", () => {
  expect(
    evaluateProgression(
      { ...p, scale: "rir", effort: 2 },
      rows().map((s) => ({ ...s, scale: "rir", effort: 1 })),
    ).action,
  ).toBe("hold");
});
it("fixed and manual hold; linear and rep progression execute typed rules", () => {
  for (const strategy of ["fixed", "manual"] as const)
    expect(
      evaluateProgression({ ...p, rule: { version: 1, strategy } }, rows())
        .action,
    ).toBe("hold");
  expect(
    evaluateProgression(
      { ...p, rule: { version: 1, strategy: "linear_load", loadStepKg: 2.5 } },
      rows([8, 8, 8]),
    ).action,
  ).toBe("increase");
  expect(
    evaluateProgression(
      {
        ...p,
        rule: {
          version: 1,
          strategy: "rep_progression",
          repStep: 1,
          repsMin: 8,
          repsMax: 12,
        },
      },
      rows([8, 9, 8]),
    ),
  ).toMatchObject({ action: "reps", reps: 9 });
});
it("exceeding the boundary qualifies while mixed loads do not", () => {
  expect(evaluateProgression(p, rows([13, 12, 14])).action).toBe("increase");
  expect(
    evaluateProgression(p, [...rows().slice(0, 2), { ...set, kg: 90 }]).action,
  ).toBe("hold");
});
it("rejects aggressive configured increments", () => {
  expect(
    evaluateProgression(
      {
        ...p,
        rule: {
          ...p.rule!,
          strategy: "linear_load",
          version: 1,
          loadStepKg: 50,
        },
      },
      rows(),
    ).action,
  ).toBe("hold");
});
it("first execution prefers actual near-target exercise history, never another exercise", () => {
  expect(suggest([{ ...set, slotId: null, reps: 10 }])?.kg).toBe(100);
  expect(suggest([{ ...set, exerciseId: "other" }])).toBeNull();
});
it("lower-rep history uses documented conservative estimation instead of copying a triple into 12-rep guidance", () => {
  const s = suggest([{ ...set, slotId: null, reps: 3 }]);
  expect(s?.action).toBe("estimate");
  expect(s!.kg).toBeLessThan(80);
  expect(s!.basis).toContain("10% reserve");
});
it("no evidence, stale/future data and zero/bodyweight load produce no suggestion", () => {
  for (const history of [
    [],
    [{ ...set, date: "2025-01-01" }],
    [{ ...set, date: "2027-01-01" }],
    [{ ...set, kg: 0 }],
  ])
    expect(suggest(history)).toBeNull();
});
it("practical unit rounding never invents precision or a per-dumbbell conversion", () => {
  expect(practicalLoad(100, "lb", false).display).toBe("220");
  expect(practicalLoad(21, "kg", true)).toMatchObject({
    display: "20",
    kg: 20,
  });
  expect(suggest(rows(), { unit: "lb" })?.display).toBe("225");
});
it("refresh is deterministic; a genuine new completed session changes the result", () => {
  expect(suggest(rows())).toEqual(suggest([...rows()].reverse()));
  expect(suggest(rows().map((s) => ({ ...s, kg: 105 })))?.kg).toBe(107.5);
});
it("corrected history is recomputed instead of trusting a persisted recommendation", () => {
  expect(suggest(rows())?.action).toBe("increase");
  expect(suggest(rows([12, 10, 9]))?.action).toBe("hold");
});

it("extra sets cannot replace unfinished required prescription positions", () => {
  expect(
    suggest([
      { ...set, setNumber: 1 },
      { ...set, setNumber: 2 },
      { ...set, setNumber: null },
    ])?.action,
  ).toBe("hold");
});
it("warm-up positions do not displace required working positions", () => {
  expect(
    suggest(
      [2, 3, 4].map((n) => ({ ...set, setNumber: n })),
      { prescription: { ...p, setNumbers: [2, 3, 4] } },
    )?.action,
  ).toBe("increase");
});
it("exceeding the prescription still permits a conservative progression", () => {
  expect(suggest(rows([15, 15, 15]))?.action).toBe("increase");
});
it("a lower rule boundary cannot override the actual prescribed upper boundary", () => {
  expect(
    evaluateProgression(
      {
        ...p,
        rule: {
          version: 1,
          strategy: "double_progression",
          loadStepKg: 2.5,
          repStep: 1,
          repsMin: 5,
          repsMax: 8,
        },
      },
      rows([8, 8, 8]),
    ).action,
  ).toBe("hold");
});

it("varied effort or rep prescriptions do not collapse into a misleading uniform progression", () => {
  const target = {
    set_type: "working",
    reps_min: 8,
    reps_max: 12,
    effort_scale: "rir",
    effort_value: 2,
  };
  expect(uniformSetTargets([target, { ...target, reps_max: 15 }])).toBe(false);
  expect(
    prescriptionRule(p.rule, [target, { ...target, effort_value: 3 }])
      ?.strategy,
  ).toBe("manual");
  expect(
    prescriptionRule(p.rule, [target, { ...target, reps_max: 15 }])?.strategy,
  ).toBe("manual");
  expect(
    prescriptionRule(p.rule, [target, { ...target, set_type: "drop" }])
      ?.strategy,
  ).toBe("manual");
  expect(prescriptionRule(p.rule, [target, { ...target }])).toEqual(p.rule);
});

it("suggestions respect the canonical recording bound instead of throwing at valid extreme history", () => {
  expect(suggest(rows().map((s) => ({ ...s, kg: 100000 })))?.action).toBe(
    "hold",
  );
  expect(
    suggest([{ ...set, slotId: null, kg: 100000, reps: 10 }], {
      prescription: { ...p, min: 1, max: 1 },
    })!.kg,
  ).toBeLessThanOrEqual(100000);
});

it("higher-rep prescriptions use actual comparable evidence without extending the estimation formula", () => {
  const high = {
    ...p,
    min: 15,
    max: 20,
    rule: {
      version: 1 as const,
      strategy: "double_progression" as const,
      loadStepKg: 2.5,
      repStep: 1,
      repsMin: 15,
      repsMax: 20,
    },
  };
  expect(suggest(rows([20, 20, 20]), { prescription: high })?.action).toBe(
    "increase",
  );
  expect(
    suggest([{ ...set, slotId: null, reps: 3 }], { prescription: high }),
  ).toBeNull();
});
