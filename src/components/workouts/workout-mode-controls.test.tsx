import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Continuity } from "@/features/continuity/model";
import { WorkoutClosureProvider, FinishWorkout } from "./workout-closure";
import { WorkoutModeControls } from "./workout-mode-controls";
const mocks = vi.hoisted(() => ({ read: vi.fn(), pause: vi.fn() }));
vi.mock("@/features/continuity/actions", () => ({
  readWorkoutContinuity: mocks.read,
  setWorkoutPause: mocks.pause,
}));
const value: Continuity = {
  id: "12345678-1234-1234-1234-123456789012",
  status: "in_progress",
  state: "active",
  server_now: "2026-11-06T12:10:00Z",
  started_at: "2026-11-06T12:00:00Z",
  last_activity_at: "2026-11-06T12:09:00Z",
  activity_evidence_at: null,
  finished_at: null,
  effective_finished_at: null,
  duration_kind: "unknown",
  closure_reason: null,
  idle_intervals: [],
  continuation_count: 0,
  completed: 0,
  total: 3,
  manual_paused_at: null,
  manual_pause_intervals: [],
  timer_revision: 0,
  effective_elapsed_seconds: 600,
};
function Harness() {
  const [data, setData] = useState(value);
  return (
    <WorkoutModeControls
      session={value.id}
      value={data}
      onState={setData}
      backHref="/workout"
      home
      disabled={false}
    >
      <button>Existing finish confirmation</button>
    </WorkoutModeControls>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ data: value });
});
it("opens timer details without pausing and exposes the existing end confirmation separately", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /Workout Timer/ }));
  expect(
    await screen.findByRole("dialog", { name: "Workout Timer" }),
  ).toBeInTheDocument();
  expect(mocks.pause).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss timer" }));
  fireEvent.click(screen.getByRole("button", { name: "End Workout" }));
  expect(
    await screen.findByRole("dialog", { name: "End workout?" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Existing finish confirmation" }),
  ).toBeInTheDocument();
  expect(mocks.pause).not.toHaveBeenCalled();
});
it("keeps the exact retry intent after a transport failure and waits for confirmed server state", async () => {
  mocks.pause
    .mockRejectedValueOnce(Error("Disconnected"))
    .mockResolvedValueOnce({
      data: {
        ...value,
        manual_paused_at: value.server_now,
        timer_revision: 1,
        server_now: "2026-11-06T12:10:01Z",
      },
    });
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /Workout Timer/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Pause Workout" }));
  await screen.findByRole("button", { name: "Retry timer change" });
  expect(screen.getByRole("status")).toHaveTextContent("Running");
  fireEvent.click(screen.getByRole("button", { name: "Retry timer change" }));
  await waitFor(() => expect(mocks.pause).toHaveBeenCalledTimes(2));
  expect(mocks.pause.mock.calls[1]).toEqual(mocks.pause.mock.calls[0]);
  expect(
    await screen.findByRole("button", { name: "Resume Workout" }),
  ).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent("Paused");
});

it("keeps Finish review accessible with an unsaved draft while both actual closure submissions remain blocked", async () => {
  render(
    <WorkoutClosureProvider session={value.id} disabled>
      <WorkoutModeControls
        session={value.id}
        value={value}
        onState={() => {}}
        backHref="/workout"
        home
        disabled={false}
      >
        <FinishWorkout disabled={false} />
      </WorkoutModeControls>
    </WorkoutClosureProvider>,
  );
  expect(screen.getByRole("button", { name: /^Abandon$/ })).toBeDisabled();
  const review = screen.getByRole("button", { name: /^Finish Workout$/ });
  expect(review).toBeEnabled();
  fireEvent.click(review);
  expect(
    await screen.findByRole("dialog", { name: "End workout?" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /^Finish workout$/ }),
  ).toBeDisabled();
});
