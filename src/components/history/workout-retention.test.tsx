import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ change: vi.fn(), rethrow: vi.fn() }));
vi.mock("@/features/retention/actions", () => ({
  changeWorkoutRetention: m.change,
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: m.rethrow }));
import { WorkoutRetention } from "./workout-retention";
beforeEach(() => vi.resetAllMocks());
it("retains confirmation and receipt identity after rejected archive transport", async () => {
  m.change
    .mockRejectedValueOnce(Error("private network detail"))
    .mockResolvedValueOnce({ error: "Authoritative revision conflict" });
  render(
    <WorkoutRetention
      session="session"
      revision={3}
      archived={false}
      request="same-request"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Archive Workout" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(
    screen.getByRole("form", { name: "archive workout confirmation" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be confirmed",
  );
  expect(screen.getByRole("checkbox")).toBeChecked();
  expect(screen.getByRole("alert")).not.toHaveTextContent(
    "private network detail",
  );
  fireEvent.submit(
    screen.getByRole("form", { name: "archive workout confirmation" }),
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
    revision: "3",
    session: "session",
    kind: "archive",
    confirmed: "yes",
  });
  expect(m.rethrow).toHaveBeenCalledOnce();
});
