import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WorkoutSetup } from "./workout-setup";
vi.mock("@/features/workouts/suggested-actions", () => ({
  startSuggestedWorkout: vi.fn(),
}));
vi.mock("./workout-controls", () => ({
  StartBlankWorkout: () => <button>Start Blank Workout</button>,
}));
const focuses = [
  {
    id: "chest",
    label: "Chest",
    emphasis: [{ id: "upper_chest", label: "Upper Chest" }],
  },
  { id: "triceps", label: "Triceps", emphasis: [] },
];
it("requires primary focus, keeps blank separate and resets emphasis/duplicate secondary", () => {
  render(
    <WorkoutSetup
      request="request"
      exercises={[]}
      recentIds={[]}
      exerciseRequest="exercise-request"
      focuses={focuses}
      counts={{
        "full_body::balanced": 5,
        "chest::balanced": 4,
        "chest::upper_chest": 4,
        "chest:triceps:balanced": 5,
        "triceps::balanced": 3,
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Start Workout" })).toBeDisabled();
  expect(
    screen.getByText("More options").closest("details"),
  ).not.toHaveAttribute("open");
  fireEvent.click(screen.getByRole("radio", { name: "Chest" }));
  expect(screen.getByRole("status")).toHaveTextContent("4 suggested movements");
  expect(screen.getByLabelText(/Emphasis/)).toHaveValue("balanced");
  fireEvent.change(screen.getByLabelText(/Emphasis/), {
    target: { value: "upper_chest" },
  });
  fireEvent.change(screen.getByLabelText(/Secondary Focus/), {
    target: { value: "triceps" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Triceps" }));
  expect(screen.getByLabelText(/Secondary Focus/)).toHaveValue("");
  expect(screen.queryByLabelText(/Emphasis/)).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("3 suggested movements");
  fireEvent.click(screen.getByRole("radio", { name: "Full Body" }));
  expect(screen.queryByLabelText(/Secondary Focus/)).toBeNull();
  expect(screen.queryByLabelText(/Emphasis/)).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("5 suggested movements");
  fireEvent.click(screen.getByRole("radio", { name: "Chest" }));
  expect(screen.getByLabelText(/Secondary Focus/)).toHaveValue("");
  expect(screen.getByLabelText(/Emphasis/)).toHaveValue("balanced");
});
