import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ change: vi.fn(), rethrow: vi.fn() }));
vi.mock("@/features/programs/lifecycle-actions", () => ({
  changeProgram: m.change,
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: m.rethrow }));
import { LifecycleForm } from "./lifecycle-form";
beforeEach(() => vi.resetAllMocks());
it("recovers a rejected transport without losing the exact lifecycle request or claiming success", async () => {
  m.change
    .mockRejectedValueOnce(Error("private transport detail"))
    .mockResolvedValueOnce({ error: "Authoritative revision conflict" });
  render(
    <LifecycleForm
      kind="end_after_next"
      assignment="assignment"
      revision={7}
      request="same-request"
      label="End After Next Workout"
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "End After Next Workout" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be confirmed",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent(
    "private transport detail",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "End After Next Workout" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("revision conflict"),
  );
  const forms = m.change.mock.calls.map((call) =>
    Object.fromEntries(call[1] as FormData),
  );
  expect(forms).toEqual([forms[0], forms[0]]);
  expect(forms[0]).toMatchObject({
    request: "same-request",
    revision: "7",
    assignment: "assignment",
    kind: "end_after_next",
  });
  expect(m.rethrow).toHaveBeenCalledOnce();
});
