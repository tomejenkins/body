import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Loading from "@/app/(app)/workout/loading";
import ErrorPage from "@/app/(app)/workout/error";
it("announces loading saved progress without presenting an empty workout", () => {
  render(<Loading />);
  expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  expect(
    screen.queryByText("No exercises selected yet."),
  ).not.toBeInTheDocument();
});
it("offers a safe retry after a load error", () => {
  const reset = vi.fn();
  render(<ErrorPage reset={reset} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Check your connection");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reset).toHaveBeenCalledOnce();
});
