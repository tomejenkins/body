import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  edit: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/features/workouts/actions", () => ({ editWorkout: mock.edit }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mock.push, refresh: mock.refresh }),
}));
import { AddFromDetails } from "./add-from-details";
const id = "12345678-1234-1234-1234-123456789012";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("uses the existing selection action and a fixed builder return", async () => {
  mock.edit.mockResolvedValue({ success: "Exercise selected." });
  render(
    <AddFromDetails workoutId={id} exerciseId={id} alreadyAdded={false} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add to Workout" }));
  await waitFor(() =>
    expect(mock.push).toHaveBeenCalledWith(`/workout/${id}/select?added=${id}`),
  );
  expect(mock.edit).toHaveBeenCalledTimes(1);
  const data = mock.edit.mock.calls[0][1] as FormData;
  expect(data.get("operation")).toBe("add");
  expect(data.get("sessionId")).toBe(id);
  expect(data.get("exerciseId")).toBe(id);
  expect(data.has("owner_id")).toBe(false);
});
it("does not issue another add for an existing selection", () => {
  render(<AddFromDetails workoutId={id} exerciseId={id} alreadyAdded />);
  const button = screen.getByRole("button", { name: "Already Added" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(mock.edit).not.toHaveBeenCalled();
});
it("refreshes authorization/state after a rejected stale add", async () => {
  mock.edit.mockResolvedValue({ error: "Workout is closed" });
  render(
    <AddFromDetails workoutId={id} exerciseId={id} alreadyAdded={false} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add to Workout" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("closed"),
  );
  expect(mock.refresh).toHaveBeenCalled();
  expect(mock.push).not.toHaveBeenCalled();
});
it("prevents repeated activation while an add is unresolved", async () => {
  let finish!: (value: { success: string }) => void;
  mock.edit.mockImplementation(
    () =>
      new Promise<{ success: string }>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <AddFromDetails workoutId={id} exerciseId={id} alreadyAdded={false} />,
  );
  const button = screen.getByRole("button", { name: "Add to Workout" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mock.edit).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  finish({ success: "Exercise selected." });
  await waitFor(() => expect(mock.push).toHaveBeenCalledTimes(1));
});
