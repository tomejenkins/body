import { act, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ConnectionStatus } from "./connection-status";
it("reports browser offline without claiming API reachability or saved changes", () => {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  const view = render(<ConnectionStatus />);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: false,
  });
  act(() => window.dispatchEvent(new Event("offline")));
  expect(screen.getByRole("status")).toHaveTextContent(
    "Offline · saving needs a connection",
  );
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  act(() => window.dispatchEvent(new Event("online")));
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  view.unmount();
});
