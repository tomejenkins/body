import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SetEffortOptions } from "./set-effort-options";
it("uses the preferred scale only after deliberate effort entry, without writing on open", () => {
  const change = vi.fn();
  render(
    <SetEffortOptions
      name="Bench set 1"
      draft={{ type: "working" }}
      preferredScale="rir"
      disabled={false}
      onChange={change}
    />,
  );
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Record effort" }));
  expect(change).not.toHaveBeenCalled();
  const rating = screen.getByRole("combobox", { name: /effort rating/ });
  expect(rating).toHaveValue("");
  fireEvent.change(rating, { target: { value: "0" } });
  expect(change).toHaveBeenCalledExactlyOnceWith({
    effortScale: "rir",
    effortValue: "0",
  });
});
it("shows historical actual effort and explicit failure without deriving or rewriting them", () => {
  const change = vi.fn();
  render(
    <SetEffortOptions
      name="Bench set 1"
      draft={{
        type: "working",
        effortScale: "rir",
        effortValue: "0",
        toFailure: true,
      }}
      preferredScale="rpe"
      disabled={false}
      onChange={change}
    />,
  );
  expect(screen.getByRole("combobox", { name: /effort rating/ })).toHaveValue(
    "0",
  );
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /More effort options/ }));
  expect(screen.getByRole("checkbox", { name: /To Failure/ })).toBeChecked();
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: /effort scale/ }), {
    target: { value: "rpe" },
  });
  expect(change).toHaveBeenCalledExactlyOnceWith({
    effortScale: "rpe",
    effortValue: "",
  });
});
it("keeps explicit failure unavailable on warm-ups and all actual controls disabled while saving", () => {
  render(
    <SetEffortOptions
      name="Bench set 1"
      draft={{ type: "warm_up", effortScale: "rpe", effortValue: "8" }}
      preferredScale="rir"
      disabled
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /More effort options/ }));
  expect(screen.getByRole("checkbox", { name: /To Failure/ })).toBeDisabled();
  for (const c of screen.getAllByRole("combobox")) expect(c).toBeDisabled();
});
it("offers optional RPE without a failure field in ordinary entry", () => {
  const change = vi.fn();
  render(
    <SetEffortOptions
      name="Bench set 1"
      draft={{ type: "working" }}
      preferredScale="rpe"
      disabled={false}
      onChange={change}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Record effort" }));
  fireEvent.change(screen.getByRole("combobox", { name: /effort rating/ }), {
    target: { value: "10" },
  });
  expect(change).toHaveBeenCalledExactlyOnceWith({
    effortScale: "rpe",
    effortValue: "10",
  });
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
