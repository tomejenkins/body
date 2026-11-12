import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { SetSettings } from "./settings-sheet";
function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <SetSettings
      label="Bench set 1 settings"
      title="Set 1 settings"
      id="set-options-a"
      open={open}
      onOpenChange={setOpen}
      onInteract={() => {}}
    >
      <label>
        Type
        <select>
          <option>Working</option>
        </select>
      </label>
    </SetSettings>
  );
}
it("keeps secondary controls unmounted until the gear opens and closes accessibly", () => {
  render(<Fixture />);
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Bench set 1 settings" }));
  expect(
    screen.getByRole("dialog", { name: "Bench set 1 settings" }),
  ).toBeVisible();
  expect(screen.getByRole("combobox")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close Set 1 settings" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Bench set 1 settings" }),
  ).toHaveAttribute("aria-expanded", "false");
});
