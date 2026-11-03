import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Loading from "@/app/(app)/exercises/loading";
import ErrorPage from "@/app/(app)/exercises/error";
it("announces loading without implying an empty library", () => {
  render(<Loading />);
  expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByText("No matching exercises")).not.toBeInTheDocument();
});
it("offers an accessible retry and safe navigation after a load failure", () => {
  const reset = vi.fn();
  render(<ErrorPage reset={reset} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Check your connection");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reset).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "Back to workout" })).toHaveAttribute(
    "href",
    "/workout",
  );
});
