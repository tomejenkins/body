import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MovementSelection } from "./movement-selection";
import type { WorkoutMovement } from "@/features/programs/execution-types";
const mocks = vi.hoisted(() => ({
  choose: vi.fn(),
  search: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/features/programs/execution-actions", () => ({
  selectProgramExercise: mocks.choose,
  searchMovementExercises: mocks.search,
}));
const movement: WorkoutMovement = {
  id: "m",
  position: 1,
  label: "Horizontal push",
  target: {
    patternId: "p",
    muscleId: "c",
    exerciseType: "compound",
    referenceEquipmentIds: [],
  },
  targetSets: 3,
  workingSets: 3,
  currentItemId: null,
  currentExerciseId: null,
  candidates: ([4, 3, 2, 1] as const).map((level) => ({
    id: `e${level}`,
    name: `Exercise ${level}`,
    level,
    labels: level === 2 ? ["Program Pick"] : [],
    equipmentAvailable: true,
    supported: true,
    visual: { slug: "", ownerId: null },
  })),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.choose.mockResolvedValue({ itemId: "saved" });
});
it("renders all four selectable compatibility levels without upgrading the Program Pick", async () => {
  render(
    <MovementSelection
      movement={movement}
      facets={{ patterns: [], muscles: [] }}
      disabled={false}
    />,
  );
  expect(
    screen.getByRole("button", { name: /Exercise 2, Similar, Program Pick/ }),
  ).toBeEnabled();
  for (const name of ["Close", "Similar", "Same Muscle"])
    expect(screen.getByText(name, { exact: true })).toBeInTheDocument();
  expect(
    screen
      .getByRole("button", { name: "Exercise 4" })
      .querySelector(".movement-match"),
  ).toBeNull();
  for (const level of [4, 3, 2, 1]) {
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`^Exercise ${level}(,|$)`),
      }),
    );
    await waitFor(() =>
      expect(mocks.choose).toHaveBeenLastCalledWith(
        expect.objectContaining({
          exerciseId: `e${level}`,
          continueRecorded: false,
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: new RegExp(`^Exercise ${level}(,|$)`),
        }),
      ).toBeEnabled(),
    );
  }
  expect(screen.queryByText(/stars|rating/i)).not.toBeInTheDocument();
});
it("retains request identity across an unconfirmed network failure and waits for server selection state", async () => {
  mocks.choose.mockRejectedValueOnce(Error("Disconnected"));
  render(
    <MovementSelection
      movement={movement}
      facets={{ patterns: [], muscles: [] }}
      disabled={false}
    />,
  );
  const tile = screen.getByRole("button", { name: /Exercise 3,/ });
  fireEvent.click(tile);
  await screen.findByRole("button", { name: "Retry selection" });
  expect(tile).toHaveAttribute("aria-pressed", "false");
  const request = mocks.choose.mock.calls[0][0].requestId;
  fireEvent.click(screen.getByRole("button", { name: "Retry selection" }));
  await waitFor(() => expect(mocks.choose).toHaveBeenCalledTimes(2));
  expect(mocks.choose.mock.calls[1][0].requestId).toBe(request);
});
it("requires explicit continuation before retrying a choice with recorded sets", async () => {
  mocks.choose.mockResolvedValueOnce({ needsContinuation: true });
  render(
    <MovementSelection
      movement={{ ...movement, currentItemId: "old" }}
      facets={{ patterns: [], muscles: [] }}
      disabled={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Exercise 1,/ }));
  await screen.findByRole("group", { name: "Confirm exercise continuation" });
  expect(mocks.choose).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Keep sets and continue" }),
  );
  await waitFor(() => expect(mocks.choose).toHaveBeenCalledTimes(2));
  expect(mocks.choose.mock.calls[1][0]).toMatchObject({
    continueRecorded: true,
    expectedItemId: "old",
    requestId: mocks.choose.mock.calls[0][0].requestId,
  });
});
it("highlights Last Used independently from compatibility and selected state", () => {
  const m = {
    ...movement,
    currentExerciseId: "e4",
    candidates: movement.candidates.map((t) => ({
      ...t,
      labels: t.id === "e3" ? ["Last Used"] : t.labels,
    })),
  };
  render(
    <MovementSelection
      movement={m}
      facets={{ patterns: [], muscles: [] }}
      disabled={false}
    />,
  );
  const last = screen.getByRole("button", {
    name: /Exercise 3, Close, Last Used/,
  });
  expect(last).toHaveClass("last-used");
  expect(last).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Exercise 4" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Exercise 4" })).not.toHaveClass(
    "last-used",
  );
});
it("retains carousel position after selection state refresh", () => {
  const props = { facets: { patterns: [], muscles: [] }, disabled: false };
  const view = render(<MovementSelection {...props} movement={movement} />);
  const group = screen.getByRole("group", { name: "Exercises for Movement 1" });
  const scrollTo = vi.fn();
  Object.defineProperty(group, "scrollTo", { value: scrollTo });
  view.rerender(
    <MovementSelection
      {...props}
      movement={{ ...movement, currentExerciseId: "e1" }}
    />,
  );
  expect(scrollTo).not.toHaveBeenCalled();
});
it("See All keeps independent muscle/pattern/equipment filters and explains changed focus", async () => {
  mocks.search.mockResolvedValue({
    items: [
      {
        ...movement.candidates[0],
        id: "outside",
        name: "Different Muscle",
        level: null,
      },
    ],
    total: 1,
  });
  render(
    <MovementSelection
      movement={movement}
      facets={{ patterns: [], muscles: [] }}
      disabled={false}
    />,
  );
  const details = screen.getByText("See All Exercises").closest("details")!;
  details.open = true;
  fireEvent.submit(
    screen.getByRole("form", {
      name: "Search exercises for Movement 1",
      hidden: true,
    }),
  );
  await waitFor(() =>
    expect(mocks.search).toHaveBeenCalledWith(
      "m",
      expect.objectContaining({
        pattern: "",
        muscle: "",
        equipmentOnly: false,
      }),
    ),
  );
  expect(await screen.findByText("Changes muscle focus")).toBeInTheDocument();
});
