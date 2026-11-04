import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/features/sets/actions", () => ({ saveWeightUnit: mock.save }));
import { WeightUnitSettings } from "./weight-unit-settings";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows confirmation only after the preference is acknowledged", async () => {
  let finish!: (value: { error?: string }) => void;
  mock.save.mockImplementation(
    () =>
      new Promise<{ error?: string }>((resolve) => {
        finish = resolve;
      }),
  );
  render(<WeightUnitSettings initialUnit="lb" />);
  fireEvent.change(screen.getByLabelText("Weight Units"), {
    target: { value: "kg" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("Saving");
  expect(screen.getByLabelText("Weight Units")).toBeDisabled();
  finish({});
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Saved"),
  );
  expect(screen.getByLabelText("Weight Units")).toHaveValue("kg");
});
it("keeps the confirmed preference and permits retry after a transport failure", async () => {
  mock.save.mockRejectedValue(new Error("Private network detail"));
  render(<WeightUnitSettings initialUnit="kg" />);
  fireEvent.change(screen.getByLabelText("Weight Units"), {
    target: { value: "lb" },
  });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("retry"),
  );
  expect(screen.getByLabelText("Weight Units")).toHaveValue("kg");
  expect(screen.getByLabelText("Weight Units")).toBeEnabled();
  expect(screen.getByRole("status")).not.toHaveTextContent(
    "Private network detail",
  );
});
