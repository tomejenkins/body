import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/features/workout-selection/actions", () => ({
  saveFavorite: m.save,
}));
import { SaveFavoriteButton } from "./save-favorite-button";
const props = {
  type: "completed_ad_hoc" as const,
  source: "source",
  request: "same-request",
  saved: false,
};
beforeEach(() => vi.resetAllMocks());
it("saves directly with no naming control and waits for server confirmation", async () => {
  let release!: (v: { success: string }) => void;
  m.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  render(<SaveFavoriteButton {...props} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(document.querySelector("details")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save as Favorite" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(screen.queryByRole("status")).toBeNull();
  await act(async () => release({ success: "Saved to Favorites" }));
  expect(
    screen.getByRole("button", { name: "Saved to Favorites" }),
  ).toBeDisabled();
  expect(m.save.mock.calls[0][1].get("request")).toBe("same-request");
  expect(m.save.mock.calls[0][1].get("name")).toBeNull();
});
it("shows an actionable error and retries the same request without false success", async () => {
  m.save
    .mockResolvedValueOnce({ error: "Not saved. Retry." })
    .mockResolvedValueOnce({ success: "Saved to Favorites" });
  render(<SaveFavoriteButton {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Save as Favorite" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Not saved");
  fireEvent.click(screen.getByRole("button", { name: "Save as Favorite" }));
  await screen.findByRole("status");
  expect(m.save.mock.calls[0][1].get("request")).toBe(
    m.save.mock.calls[1][1].get("request"),
  );
});
it("renders a known existing Favorite as saved without a write", () => {
  render(<SaveFavoriteButton {...props} saved />);
  expect(
    screen.getByRole("button", { name: "Saved to Favorites" }),
  ).toBeDisabled();
  expect(m.save).not.toHaveBeenCalled();
});

it("retains an actionable retry after transport rejection rather than implying success", async () => {
  m.save
    .mockRejectedValueOnce(Error("Disconnected"))
    .mockResolvedValueOnce({ success: "Saved to Favorites" });
  render(<SaveFavoriteButton {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Save as Favorite" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be confirmed",
  );
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save as Favorite" }));
  await screen.findByRole("status");
  expect(m.save.mock.calls[0][1].get("request")).toBe(
    m.save.mock.calls[1][1].get("request"),
  );
});

it("retains the request identity across same-source server revalidation", async () => {
  m.save.mockResolvedValue({ success: "Saved to Favorites" });
  const view = render(<SaveFavoriteButton {...props} />);
  view.rerender(
    <SaveFavoriteButton {...props} request="replacement-server-render" />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save as Favorite" }));
  await screen.findByRole("status");
  expect(m.save.mock.calls[0][1].get("request")).toBe("same-request");
});
