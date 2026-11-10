import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ end: vi.fn() }));
vi.mock("@/features/workouts/actions", () => ({ endWorkout: m.end }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
import {
  WorkoutClosureProvider,
  FinishWorkout,
  InlineAbandon,
} from "./workout-closure";
function view(session = "one", disabled = false) {
  return (
    <WorkoutClosureProvider session={session} disabled={disabled}>
      <FinishWorkout disabled={false} />
      <InlineAbandon />
    </WorkoutClosureProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  m.end.mockResolvedValue({
    error: "Check the authoritative workout and retry.",
  });
});
it("arms locally with destructive styling and cancellation makes no request", () => {
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
  expect(m.end).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm Abandon" })).toHaveClass(
    "bg-destructive",
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel abandonment" }));
  expect(screen.getByRole("button", { name: "Abandon" })).toBeVisible();
  expect(m.end).not.toHaveBeenCalled();
});
it("second tap uses existing exact-session abandonment and keeps failures recoverable", async () => {
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm Abandon" }));
  await waitFor(() => expect(m.end).toHaveBeenCalledOnce());
  expect(m.end.mock.calls[0][1].get("sessionId")).toBe("one");
  expect(m.end.mock.calls[0][1].get("outcome")).toBe("abandoned");
  await screen.findByRole("alert");
  expect(
    screen.getByRole("button", { name: "Cancel abandonment" }),
  ).toBeEnabled();
});
it("shares pending state and blocks conflicting closure submissions", async () => {
  let finish: (value: { error: string }) => void = () => {};
  m.end.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm Abandon" }));
  await waitFor(() => expect(m.end).toHaveBeenCalledOnce());
  for (const b of screen.getAllByRole("button", { name: "Closing workout…" }))
    expect(b).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Cancel abandonment" }),
  ).toBeDisabled();
  await act(async () => finish({ error: "Still active; retry safely." }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Still active");
});
it("resets armed confirmation on session changes and honors draft/pending blockers", () => {
  const r = render(view());
  fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
  r.rerender(view("two"));
  expect(
    screen.queryByRole("button", { name: "Confirm Abandon" }),
  ).not.toBeInTheDocument();
  r.rerender(view("two", true));
  expect(screen.getByRole("button", { name: "Abandon" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Finish workout" })).toBeDisabled();
  expect(m.end).not.toHaveBeenCalled();
});
