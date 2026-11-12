import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CardioSummary } from "./cardio-summary";
it("shows actual cardio in History/completion separately from strength sets", () => {
  render(
    <CardioSummary
      items={[
        {
          id: "a",
          activity: "treadmill",
          revision: 2,
          durationSeconds: 1200,
          completedAt: "2026-11-11T00:00:00Z",
        },
        {
          id: "b",
          activity: "bike",
          revision: 1,
          durationSeconds: null,
          completedAt: null,
        },
      ]}
    />,
  );
  expect(
    screen.getByRole("region", { name: "Manual cardio" }),
  ).toHaveTextContent("20 min recorded · 1 activity");
  expect(screen.getByText("Not completed")).toBeVisible();
  expect(screen.queryByText(/PR|reps|weight/i)).toBeNull();
});
